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

/** 발송 대기/완료 표 — 주소는 싣지 않는다(수취인 이름까지) */
export function formatOrdersTable(orders, shipped = false) {
  if (!orders.length) return "  (없음)";
  const head = shipped
    ? `  ${pad("주문번호", 10)} ${pad("발송", 12)} ${pad("수취인", 10)} ${pad("택배사", 10)} ${pad("운송장", 16)} ${pad("상태", 16)} 상품`
    : `  ${pad("주문번호", 10)} ${pad("결제", 12)} ${pad("수취인", 10)} ${pad("줄", 3)} ${pad("금액", 9)} ${pad("상태", 16)} 상품`;
  const body = orders.map((o) =>
    shipped
      ? `  ${pad(o.code.toUpperCase(), 10)} ${pad(kst(o.shippedAt), 12)} ${pad(o.recipient || o.buyerName, 10)} ${pad(o.courier ?? "-", 10)} ${pad(o.trackingNo ?? "-", 16)} ${pad(o.status, 16)} ${o.orderName}`
      : `  ${pad(o.code.toUpperCase(), 10)} ${pad(kst(o.paidAt), 12)} ${pad(o.recipient || o.buyerName, 10)} ${pad(o.lines, 3)} ${pad(`₩${Number(o.amount).toLocaleString("ko-KR")}`, 9)} ${pad(o.status, 16)} ${o.orderName}`
  );
  return [head, ...body].join("\n");
}
