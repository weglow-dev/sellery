// MYR 운영 스크립트(myr-ops.mjs) 순수 부분 — 인자 파싱 · CSV 파싱 · 표 출력. 테스트: src/test/myr-ops-plan.test.ts
// 택배사·운송장·주문번호의 **판정은 하지 않는다** — 샵 서버(apps/myr-shop lib/ship-rules.ts + 0069 RPC)가 한 곳에서 한다. 여기서는 빈 칸만 본다.

/** `<cmd> [args…] [--flag [value]]` */
export function parseArgs(argv) {
  const cmd = argv[0];
  const args = [];
  const flags = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else args.push(a);
  }
  return { cmd, args, flags };
}

/** 줄마다 `주문번호,택배사,운송장` — 머리줄(주문번호/order 로 시작)·빈 줄은 건너뜀 · 탭 구분도 허용 · 따옴표 제거. 빈 칸이 있으면 problems */
export function parseShipCsv(text) {
  const rows = [];
  const problems = [];
  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cells = raw.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /^(주문번호|order)/i.test(cells[0] ?? "")) continue;
    const [orderCode, courier, trackingNo] = cells;
    if (!orderCode || !courier || !trackingNo) {
      problems.push(`${i + 1}행: 주문번호,택배사,운송장 세 칸이 필요해요 — "${raw}"`);
      continue;
    }
    rows.push({ line: i + 1, orderCode, courier, trackingNo });
  }
  return { rows, problems };
}

const pad = (s, n) => {
  const str = String(s ?? "");
  // 한글은 2칸으로 센다
  const width = [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
  return str + " ".repeat(Math.max(0, n - width));
};
const kst = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");

/** 줄 배송 상태(0077) → 한국어 */
export const SHIP_KO = { PAID: "결제완료", PREPARING: "배송준비중", SHIPPING: "배송중", DELIVERED: "배송완료" };
const shipKo = (o) => SHIP_KO[o.shipStatus] ?? o.status;

/** 발송 대기/완료 표 — 주소는 싣지 않는다(수취인 이름까지) · 상태 칸은 줄 배송 상태(0077 · 없으면 주문 상태) */
export function formatOrdersTable(orders, shipped = false) {
  if (!orders.length) return "  (없음)";
  const head = shipped
    ? `  ${pad("주문번호", 10)} ${pad("발송", 12)} ${pad("수취인", 10)} ${pad("택배사", 10)} ${pad("운송장", 16)} ${pad("상태", 16)} 상품`
    : `  ${pad("주문번호", 10)} ${pad("결제", 12)} ${pad("수취인", 10)} ${pad("줄", 3)} ${pad("금액", 9)} ${pad("상태", 16)} 상품`;
  const body = orders.map((o) =>
    shipped
      ? `  ${pad(o.code.toUpperCase(), 10)} ${pad(kst(o.shippedAt), 12)} ${pad(o.recipient || o.buyerName, 10)} ${pad(o.courier ?? "-", 10)} ${pad(o.trackingNo ?? "-", 16)} ${pad(shipKo(o), 16)} ${o.orderName}`
      : `  ${pad(o.code.toUpperCase(), 10)} ${pad(kst(o.paidAt), 12)} ${pad(o.recipient || o.buyerName, 10)} ${pad(o.lines, 3)} ${pad(`₩${Number(o.amount).toLocaleString("ko-KR")}`, 9)} ${pad(shipKo(o), 16)} ${o.orderName}`
  );
  return [head, ...body].join("\n");
}

/** 배송준비중 대상(0077 prepare_candidates) 표 — 주문번호 · 결제 · 수취인 · 상품 × 수량 */
export function formatPrepareTable(lines) {
  if (!lines.length) return "  (없음)";
  const head = `  ${pad("주문번호", 10)} ${pad("결제", 12)} ${pad("수취인", 10)} 상품`;
  const body = lines.map((l) => `  ${pad(String(l.orderCode).toUpperCase(), 10)} ${pad(kst(l.paidAt), 12)} ${pad(l.recipient, 10)} ${l.goodsName}${l.goodsOption ? ` (${l.goodsOption})` : ""} × ${l.qty}`);
  return [head, ...body].join("\n");
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** 물류센터에 넘길 CSV — 줄마다 주문번호 · 수취인 · 연락처 · 우편번호 · 주소 · 상세주소 · 상품코드 · 상품 · 옵션 · 수량 · 배송메모(엑셀이 한글을 깨지 않게 BOM) */
export function prepareCsv(lines) {
  const head = ["주문번호", "수취인", "연락처", "우편번호", "주소", "상세주소", "상품코드", "상품", "옵션", "수량", "배송메모"];
  const rows = lines.map((l) => [String(l.orderCode).toUpperCase(), l.recipient, l.phone, l.postcode, l.address1, l.address2, l.goodsCode, l.goodsName, l.goodsOption, l.qty, l.memo]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/* ---------------- 교환 · 환불 요청(0078) ---------------- */
/** 지금 단계(claim JSON step · 상태) → 운영이 할 일 */
export const CLAIM_STEP_KO = { decide: "크리에이터 승인 대기", collect: "회수 확인 필요", refund: "환불 재시도 필요", reship: "재발송 송장 필요" };
const CLAIM_STATUS_KO = { pending: "처리 대기", progress: "진행 중", done: "완료", rejected: "반려" };
const RESOLUTION_KO = { refund: "전액 환불", partial: "부분 환불", reship: "재발송", reship_collect: "재발송+회수" };
const claimTodo = (c) => (c.status === "pending" || c.status === "progress" ? (CLAIM_STEP_KO[c.step] ?? CLAIM_STATUS_KO[c.status]) : CLAIM_STATUS_KO[c.status] ?? c.status);

/** 요청 표 — 요청번호 · 접수 · 주문 · 종류/사유 · 처리 · 할 일 · 상품 × 수량(고객 연락처 · 주소는 싣지 않는다) */
export function formatClaimsTable(claims) {
  if (!claims.length) return "  (없음)";
  const head = `  ${pad("요청", 8)} ${pad("접수", 12)} ${pad("주문", 10)} ${pad("종류 · 사유", 16)} ${pad("처리", 12)} ${pad("할 일", 18)} 상품`;
  const body = claims.map(
    (c) =>
      `  ${pad(String(c.code).toUpperCase(), 8)} ${pad(kst(c.createdAt), 12)} ${pad(String(c.order?.code ?? "").toUpperCase(), 10)} ${pad(`${c.kind === "exchange" ? "교환" : "환불"} · ${c.reason}`, 16)} ${pad(c.resolution ? RESOLUTION_KO[c.resolution] : "-", 12)} ${pad(claimTodo(c), 18)} ${c.order?.item?.name ?? "상품"} × ${c.qty}`
  );
  return [head, ...body].join("\n");
}
