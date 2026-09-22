/**
 * 브랜드 주문 · 발주 · 운송장 규칙 — `/brand/orders` 의 순수 규칙 (docs/brand-console-plan.md §4 "0018" · §5 `/brand/orders` · §6 행 4).
 * 순수 모듈(브라우저 `.svelte` 와 서버 양쪽) — DB 호출은 `../server/brand/orders.server.ts`, 토스 취소는 `@sellery/payments/server/brand-refund`.
 * 프로토타입 원본: actions.ts saveTrackOne · applyTrackCSV · trackCSVTemplate · poCSV · dlCSV(BOM + CRLF) · refund.
 *
 *   ORDER_FILTERS · isOrderFilter                       표 필터 칩 all · unshipped · shipped · refunded (0018 app_brand_orders p_filter)
 *   parseBrandOrders(json)                              app_brand_orders jsonb → { rows, totals } (계약 위반 행은 버린다)
 *   orderShipState(row) · orderRowLabel(row)            행 상태 칩(미발송 · 발송 · 환불) — 0004 판정 규칙(PAID && tracking_no)
 *   parseShipOrderInput(form)                           단건 운송장 폼(order_code · courier · tracking_no) — 0018 app_brand_ship_order 와 같은 조건
 *   parseBulkShipCsv(text)                              운송장 CSV(주문번호,택배사,운송장) → 행 + 줄별 오류 · BOM · CRLF · 따옴표 · 헤더 허용
 *   bulkShipTemplateCsv(rows)                           미발송 주문으로 만드는 업로드 양식(BOM + CRLF)
 *   parseShipOrderResult · parseBulkShipResult          RPC 결과 → 타입 · SHIP_ORDER_FAIL_MESSAGES · shipOrderFailMessage
 *   parsePoRows(json) · poCsv(rows)                     app_brand_po_rows → 발주서 CSV(BOM + CRLF · 열 PO_COLUMNS)
 *   BRAND_REFUND_FAIL_MESSAGES · brandRefundFailMessage  브랜드 환불 가드(0018 app_brand_refund_precheck · 0008 코드) 문구
 */
import { COURIERS, isCourier, type Courier } from "../carriers";
import { parseStoredShipping } from "../partner/sample-rules";
import type { Shipping } from "../types";
import { TRACKING_RE, normalizeTrackingNo } from "./campaign-rules";

export { COURIERS, isCourier, TRACKING_RE, normalizeTrackingNo, type Courier };

/* ---------------- 필터 ---------------- */

export type OrderFilter = "all" | "unshipped" | "shipped" | "refunded";

export const ORDER_FILTERS: readonly { key: OrderFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "unshipped", label: "미발송" },
  { key: "shipped", label: "발송" },
  { key: "refunded", label: "환불" },
];

export function isOrderFilter(v: unknown): v is OrderFilter {
  return v === "all" || v === "unshipped" || v === "shipped" || v === "refunded";
}

/* ---------------- 행 ---------------- */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const intOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const intOr = (v: unknown, d = 0): number => intOrNull(v) ?? d;

export type BrandOrderRow = {
  id: string;
  /** 주문번호 (o2000~) — 화면은 대문자 */
  code: string;
  status: string;
  buyer_name: string;
  buyer_phone: string | null;
  /** 마스킹된 이메일 (k***@x.com) */
  buyer_email: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  option_name: string | null;
  order_name: string | null;
  /** 수취인 원문 — 발송 목적(계획서 §8). 시드 주문은 null */
  shipping: Shipping | null;
  courier: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  shipped: boolean;
  payment_method: string | null;
  paid_at: string;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_actor: string | null;
  refund_reason: string | null;
  campaign: {
    id: string;
    code: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    product: { id: string; code: string; name: string; emoji: string; thumb_url: string | null } | null;
    seller: { id: string; code: string; name: string; handle: string } | null;
  };
};

export type BrandOrderTotals = {
  count: number;
  unshipped: number;
  shipped: number;
  refunded: number;
  paid_amount: number;
  refund_amount: number;
};

export type BrandOrders = { filter: OrderFilter; rows: BrandOrderRow[]; totals: BrandOrderTotals };

export function parseBrandOrderRow(json: unknown): BrandOrderRow | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const code = strOrNull(o.code);
  const status = strOrNull(o.status);
  const paid_at = strOrNull(o.paid_at);
  const c = obj(o.campaign);
  if (!id || !code || !status || !paid_at || !c) return null;
  const cid = strOrNull(c.id);
  const ccode = strOrNull(c.code);
  const cstatus = strOrNull(c.status);
  if (!cid || !ccode || !cstatus) return null;
  const p = obj(c.product);
  const s = obj(c.seller);
  return {
    id,
    code,
    status,
    buyer_name: str(o.buyer_name, "고객"),
    buyer_phone: strOrNull(o.buyer_phone),
    buyer_email: strOrNull(o.buyer_email),
    qty: intOr(o.qty, 1),
    unit_price: intOr(o.unit_price),
    amount: intOr(o.amount),
    option_name: strOrNull(o.option_name),
    order_name: strOrNull(o.order_name),
    shipping: parseStoredShipping(o.shipping),
    courier: strOrNull(o.courier),
    tracking_no: strOrNull(o.tracking_no),
    shipped_at: strOrNull(o.shipped_at),
    shipped: o.shipped === true,
    payment_method: strOrNull(o.payment_method),
    paid_at,
    refunded_at: strOrNull(o.refunded_at),
    refund_amount: intOrNull(o.refund_amount),
    refund_actor: strOrNull(o.refund_actor),
    refund_reason: strOrNull(o.refund_reason),
    campaign: {
      id: cid,
      code: ccode,
      status: cstatus,
      start_date: strOrNull(c.start_date),
      end_date: strOrNull(c.end_date),
      product: p && strOrNull(p.id) && strOrNull(p.name)
        ? { id: str(p.id), code: str(p.code), name: str(p.name), emoji: str(p.emoji, "📦"), thumb_url: strOrNull(p.thumb_url) }
        : null,
      seller: s && strOrNull(s.id) ? { id: str(s.id), code: str(s.code), name: str(s.name), handle: str(s.handle) } : null,
    },
  };
}

export function parseBrandOrders(json: unknown): BrandOrders | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  const rows = Array.isArray(o.rows) ? o.rows.map(parseBrandOrderRow).filter((r): r is BrandOrderRow => r !== null) : [];
  const t = obj(o.totals) ?? {};
  const filter = isOrderFilter(o.filter) ? o.filter : "all";
  return {
    filter,
    rows,
    totals: {
      count: intOr(t.count),
      unshipped: intOr(t.unshipped),
      shipped: intOr(t.shipped),
      refunded: intOr(t.refunded),
      paid_amount: intOr(t.paid_amount),
      refund_amount: intOr(t.refund_amount),
    },
  };
}

export type OrderShipState = "unshipped" | "shipped" | "refunded";

/** 0004 판정 규칙: status='PAID' && tracking_no → 발송. REFUNDED · CANCELED → 환불 */
export function orderShipState(o: { status: string; tracking_no: string | null }): OrderShipState {
  if (o.status !== "PAID") return "refunded";
  return o.tracking_no ? "shipped" : "unshipped";
}

export const ORDER_STATE_CHIPS: Record<OrderShipState, { label: string; tone: "amber" | "green" | "gray" }> = {
  unshipped: { label: "미발송", tone: "amber" },
  shipped: { label: "발송", tone: "green" },
  refunded: { label: "환불", tone: "gray" },
};

export function orderRowLabel(o: { status: string; tracking_no: string | null; courier?: string | null }): { label: string; tone: "amber" | "green" | "gray" } {
  const st = orderShipState(o);
  const chip = ORDER_STATE_CHIPS[st];
  return st === "shipped" && o.courier ? { label: `${o.courier} 발송`, tone: chip.tone } : chip;
}

/* ---------------- 단건 운송장 폼 (0018 app_brand_ship_order 와 같은 조건) ---------------- */

/** 주문번호 폼 값 — /api/payments/cancel · orders.server ORDER_CODE_RE 와 같은 규칙 */
export const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

export type ShipOrderField = "order_code" | "courier" | "tracking_no";

export const SHIP_ORDER_FIELD_MESSAGES: Record<ShipOrderField, string> = {
  order_code: "주문번호를 확인해주세요",
  courier: `택배사를 선택해주세요 (${COURIERS.join(" · ")})`,
  tracking_no: "송장번호를 확인해주세요 — 숫자·영문·하이픈 6~30자",
};

export type ParsedShipOrderInput =
  | { ok: true; orderCode: string; courier: Courier; trackingNo: string }
  | { ok: false; field: ShipOrderField; message: string };

function formToObj(raw: unknown): Obj | null {
  if (typeof FormData !== "undefined" && raw instanceof FormData) {
    return Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"));
  }
  return obj(raw);
}

export function parseShipOrderInput(raw: unknown): ParsedShipOrderInput {
  const src = formToObj(raw);
  const orderCode = str(src?.order_code).trim();
  if (!ORDER_CODE_RE.test(orderCode)) return { ok: false, field: "order_code", message: SHIP_ORDER_FIELD_MESSAGES.order_code };
  const courier = str(src?.courier).trim();
  if (!isCourier(courier)) return { ok: false, field: "courier", message: SHIP_ORDER_FIELD_MESSAGES.courier };
  const trackingNo = normalizeTrackingNo(str(src?.tracking_no));
  if (!TRACKING_RE.test(trackingNo) || !/\d/.test(trackingNo)) {
    return { ok: false, field: "tracking_no", message: SHIP_ORDER_FIELD_MESSAGES.tracking_no };
  }
  return { ok: true, orderCode, courier, trackingNo };
}

/* ---------------- CSV 공용 ---------------- */

const BOM = String.fromCharCode(0xfeff);

/** 한 줄을 셀로 — 큰따옴표 안의 콤마·개행·"" 이스케이프 지원, 탭 구분도 허용(엑셀 붙여넣기) */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === "," || ch === "\t") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** 프로토타입 dlCSV: BOM + 각 셀 따옴표 + CRLF (엑셀 호환) */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return BOM + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/* ---------------- 운송장 일괄 CSV (주문번호,택배사,운송장) ---------------- */

export const BULK_SHIP_HEADER = ["주문번호", "택배사", "운송장번호"] as const;
export const BULK_SHIP_MAX_ROWS = 500;

export type BulkShipRow = { line: number; order_code: string; courier: string; tracking_no: string };
export type BulkShipCsvError = { line: number; message: string };

export type ParsedBulkShipCsv = { rows: BulkShipRow[]; errors: BulkShipCsvError[] };

/** 택배사 셀 — 정확한 이름 또는 흔한 축약('CJ' · '우체국' · '한진' · '롯데' · '로젠') 허용 */
export function normalizeCourierCell(v: string): Courier | null {
  const s = v.replace(/\s/g, "");
  if (isCourier(s)) return s;
  const hit = COURIERS.find((c) => s !== "" && (c.startsWith(s) || c.toLowerCase().startsWith(s.toLowerCase())));
  return hit ?? null;
}

/**
 * 헤더 행(첫 셀에 '주문번호')은 건너뛴다. 3열(주문번호,택배사,운송장) 기본 · 2열(주문번호,운송장 — 옛 양식)은 courier 를 defaultCourier 로.
 * 형식 오류 행은 errors 로, 나머지는 rows 로 — 서버 결과(행별 code)와 합쳐 화면에 보여준다.
 */
export function parseBulkShipCsv(text: string, opts: { defaultCourier?: Courier } = {}): ParsedBulkShipCsv {
  const rows: BulkShipRow[] = [];
  const errors: BulkShipCsvError[] = [];
  const lines = text.replace(new RegExp(`^${BOM}`), "").split(/\r\n|\r|\n/);
  lines.forEach((ln, i) => {
    const line = i + 1;
    if (!ln.trim()) return;
    const cells = splitCsvLine(ln);
    if (/주문번호|order/i.test(cells[0] ?? "")) return;
    const order_code = (cells[0] ?? "").trim();
    let courierCell: string;
    let trackingCell: string;
    if (cells.length >= 3) {
      courierCell = cells[1] ?? "";
      trackingCell = cells[2] ?? "";
    } else if (cells.length === 2) {
      courierCell = opts.defaultCourier ?? "";
      trackingCell = cells[1] ?? "";
    } else {
      errors.push({ line, message: "열이 부족해요 — 주문번호,택배사,운송장번호" });
      return;
    }
    if (!ORDER_CODE_RE.test(order_code)) {
      errors.push({ line, message: SHIP_ORDER_FIELD_MESSAGES.order_code });
      return;
    }
    const courier = normalizeCourierCell(courierCell);
    if (!courier) {
      errors.push({ line, message: SHIP_ORDER_FIELD_MESSAGES.courier });
      return;
    }
    const tracking_no = normalizeTrackingNo(trackingCell);
    if (!TRACKING_RE.test(tracking_no) || !/\d/.test(tracking_no)) {
      errors.push({ line, message: SHIP_ORDER_FIELD_MESSAGES.tracking_no });
      return;
    }
    rows.push({ line, order_code, courier, tracking_no });
  });
  if (rows.length > BULK_SHIP_MAX_ROWS) {
    errors.push({ line: 0, message: `한 번에 ${BULK_SHIP_MAX_ROWS}행까지 올릴 수 있어요 (${rows.length}행)` });
    rows.length = BULK_SHIP_MAX_ROWS;
  }
  return { rows, errors };
}

/** 업로드 양식 — 미발송 주문번호(대문자)를 채워 준다 (프로토타입 trackCSVTemplate) */
export function bulkShipTemplateCsv(rows: readonly { code: string }[]): string {
  return toCsv([BULK_SHIP_HEADER, ...rows.map((r) => [r.code.toUpperCase(), "", ""])]);
}

/* ---------------- RPC 결과 ---------------- */

export type ShipOrderCode = "NOT_FOUND" | "SAMPLE" | "NOT_PAID" | "BAD_COURIER" | "BAD_TRACKING" | "DB_ERROR";

export const SHIP_ORDER_CODES: readonly ShipOrderCode[] = ["NOT_FOUND", "SAMPLE", "NOT_PAID", "BAD_COURIER", "BAD_TRACKING", "DB_ERROR"];

export function isShipOrderCode(v: unknown): v is ShipOrderCode {
  return (SHIP_ORDER_CODES as readonly unknown[]).includes(v);
}

export type ShipOrderResult =
  | { ok: true; already: boolean; replaced: boolean; orderId: string; orderCode: string; courier: string; trackingNo: string; shippedAt: string | null }
  | { ok: false; code: ShipOrderCode; status?: string | null };

export function parseShipOrderResult(json: unknown): ShipOrderResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const orderId = strOrNull(o.order_id);
    const orderCode = strOrNull(o.order_code);
    if (!orderId || !orderCode) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      already: o.already === true,
      replaced: o.replaced === true,
      orderId,
      orderCode,
      courier: str(o.courier),
      trackingNo: str(o.tracking_no),
      shippedAt: strOrNull(o.shipped_at),
    };
  }
  const code = isShipOrderCode(o.code) ? o.code : "DB_ERROR";
  return { ok: false, code, status: strOrNull(o.status) };
}

export const SHIP_ORDER_FAIL_MESSAGES: Record<ShipOrderCode, string> = {
  NOT_FOUND: "주문을 찾을 수 없어요",
  SAMPLE: "인플루언서 샘플 주문은 캠페인 상세의 [발송 처리]로 보내주세요",
  NOT_PAID: "결제 완료 상태가 아닌 주문이에요",
  BAD_COURIER: SHIP_ORDER_FIELD_MESSAGES.courier,
  BAD_TRACKING: SHIP_ORDER_FIELD_MESSAGES.tracking_no,
  DB_ERROR: "잠시 후 다시 시도해주세요",
};

export function shipOrderFailMessage(r: { code: string; status?: string | null }): string {
  if (r.code === "NOT_PAID" && r.status) return `${SHIP_ORDER_FAIL_MESSAGES.NOT_PAID} (${r.status === "REFUNDED" || r.status === "CANCELED" ? "환불됨" : r.status})`;
  return isShipOrderCode(r.code) ? SHIP_ORDER_FAIL_MESSAGES[r.code] : SHIP_ORDER_FAIL_MESSAGES.DB_ERROR;
}

export const SHIP_ORDER_DONE_MESSAGES = {
  saved: "운송장 저장 — 발송 처리됐어요 (고객 화면에 조회 링크가 뜹니다)",
  replaced: "운송장을 정정했어요",
  already: "이미 같은 운송장이 등록돼 있어요",
} as const;

export type BulkShipRowResult =
  | { order_code: string; ok: true; already: boolean; courier: string; tracking_no: string }
  | { order_code: string; ok: false; code: ShipOrderCode; status?: string | null };

export type BulkShipResult =
  | { ok: true; applied: number; already: number; failed: number; results: BulkShipRowResult[] }
  | { ok: false; code: "BAD_ROWS" | "DB_ERROR" };

export function parseBulkShipResult(json: unknown): BulkShipResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: o.code === "BAD_ROWS" ? "BAD_ROWS" : "DB_ERROR" };
  const results: BulkShipRowResult[] = [];
  for (const r of Array.isArray(o.results) ? o.results : []) {
    const x = obj(r);
    if (!x) continue;
    const order_code = str(x.order_code);
    if (x.ok === true) results.push({ order_code, ok: true, already: x.already === true, courier: str(x.courier), tracking_no: str(x.tracking_no) });
    else results.push({ order_code, ok: false, code: isShipOrderCode(x.code) ? x.code : "DB_ERROR", status: strOrNull(x.status) });
  }
  return { ok: true, applied: intOr(o.applied), already: intOr(o.already), failed: intOr(o.failed), results };
}

export function bulkShipSummary(r: Extract<BulkShipResult, { ok: true }>, csvErrors = 0): string {
  const parts = [`${r.applied}건 적용`];
  if (r.already) parts.push(`${r.already}건 이미 등록`);
  const failed = r.failed + csvErrors;
  if (failed) parts.push(`${failed}건 실패`);
  return `송장 업로드 — ${parts.join(" · ")}`;
}

/* ---------------- 발주서 (0018 app_brand_po_rows → CSV) ---------------- */

export type PoRow = {
  order_code: string;
  paid_at: string;
  recipient: string | null;
  phone: string | null;
  postcode: string | null;
  address1: string | null;
  address2: string | null;
  memo: string | null;
  product_name: string;
  option_name: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  campaign_code: string;
  seller_handle: string;
  courier: string | null;
  tracking_no: string | null;
};

export type PoCampaign = { id: string; code: string; product_name: string; seller_handle: string; first_export: boolean };

export type PoRows = { exported_at: string | null; campaigns: PoCampaign[]; rows: PoRow[] };

export function parsePoRows(json: unknown): PoRows | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  const campaigns: PoCampaign[] = [];
  for (const c of Array.isArray(o.campaigns) ? o.campaigns : []) {
    const x = obj(c);
    if (!x || !strOrNull(x.id) || !strOrNull(x.code)) continue;
    campaigns.push({ id: str(x.id), code: str(x.code), product_name: str(x.product_name), seller_handle: str(x.seller_handle), first_export: x.first_export === true });
  }
  const rows: PoRow[] = [];
  for (const r of Array.isArray(o.rows) ? o.rows : []) {
    const x = obj(r);
    if (!x || !strOrNull(x.order_code)) continue;
    rows.push({
      order_code: str(x.order_code),
      paid_at: str(x.paid_at),
      recipient: strOrNull(x.recipient),
      phone: strOrNull(x.phone),
      postcode: strOrNull(x.postcode),
      address1: strOrNull(x.address1),
      address2: strOrNull(x.address2),
      memo: strOrNull(x.memo),
      product_name: str(x.product_name),
      option_name: strOrNull(x.option_name),
      qty: intOr(x.qty, 1),
      unit_price: intOr(x.unit_price),
      amount: intOr(x.amount),
      campaign_code: str(x.campaign_code),
      seller_handle: str(x.seller_handle),
      courier: strOrNull(x.courier),
      tracking_no: strOrNull(x.tracking_no),
    });
  }
  return { exported_at: strOrNull(o.exported_at), campaigns, rows };
}

/** 발주서 열 — 프로토타입 poCSV(주문번호·일자·상품·인플루언서·구매자·수량·단가·금액·상태) + 수취인·연락처·주소(브랜드 직배송) + 운송장 */
export const PO_COLUMNS = [
  "주문번호",
  "주문일",
  "수령인",
  "연락처",
  "우편번호",
  "주소",
  "상세주소",
  "배송메모",
  "상품",
  "옵션",
  "수량",
  "단가",
  "금액",
  "캠페인",
  "인플루언서",
  "택배사",
  "운송장",
] as const;

/** 'YYYY-MM-DD' (KST 가 아니라 ISO 앞 10자 — 발주서는 주문 당일 기준으로 충분) */
function ymdOf(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export function poCsv(rows: readonly PoRow[]): string {
  return toCsv([
    PO_COLUMNS,
    ...rows.map((r) => [
      r.order_code.toUpperCase(),
      ymdOf(r.paid_at),
      r.recipient ?? "",
      r.phone ?? "",
      r.postcode ?? "",
      r.address1 ?? "",
      r.address2 ?? "",
      r.memo ?? "",
      r.product_name,
      r.option_name ?? "",
      r.qty,
      r.unit_price,
      r.amount,
      r.campaign_code.toUpperCase(),
      r.seller_handle,
      r.courier ?? "",
      r.tracking_no ?? "",
    ]),
  ]);
}

/** 파일명 — 프로토타입 `발주서_{브랜드}_{YYYY-MM-DD}.csv` */
export function poFileName(brandName: string, ymd: string): string {
  const safe = brandName.replace(/[\\/:*?"<>|]+/g, "").trim() || "brand";
  return `발주서_${safe}_${ymd}.csv`;
}

/* ---------------- 브랜드 환불 (0018 app_brand_refund_precheck → 토스 → 0008 app_refund_record) ---------------- */

export type BrandRefundCode = "NOT_FOUND" | "SAMPLE" | "SHIPPED" | "SETTLED" | "REFUNDED" | "CANCELED" | "NO_PAYMENT_KEY" | "PARTIAL_CANCELED" | "CANCEL_FAILED" | "RECORD_FAILED" | "DB_ERROR";

export const BRAND_REFUND_FAIL_MESSAGES: Record<BrandRefundCode, string> = {
  NOT_FOUND: "주문을 찾을 수 없어요",
  SAMPLE: "인플루언서 샘플 구매분은 브랜드 정산에 포함된 건이라 여기서 환불하지 않습니다 — 캠페인 스레드에서 협의해주세요",
  SHIPPED: "발송된 주문은 원클릭 환불이 아니라 교환·반품 문의로 처리해주세요 (회수 뒤 운영팀이 취소)",
  SETTLED: "정산이 완료된 판매의 주문은 환불 처리할 수 없습니다 — 별도 CS 정산 조정이 필요해요",
  REFUNDED: "이미 환불된 주문이에요",
  CANCELED: "이미 취소된 주문이에요",
  NO_PAYMENT_KEY: "결제 정보를 찾을 수 없어 취소할 수 없어요 — 운영팀에 문의해주세요 (시드·수기 주문)",
  PARTIAL_CANCELED: "일부 금액이 이미 취소된 주문이에요 — 운영팀에 문의해주세요",
  CANCEL_FAILED: "결제 취소에 실패했어요 — 잠시 후 다시 시도해주세요",
  RECORD_FAILED: "환불은 처리됐지만 주문 기록 갱신에 실패했어요 — 운영팀에 문의해주세요",
  DB_ERROR: "잠시 후 다시 시도해주세요",
};

export function isBrandRefundCode(v: unknown): v is BrandRefundCode {
  return typeof v === "string" && v in BRAND_REFUND_FAIL_MESSAGES;
}

export function brandRefundFailMessage(code: string): string {
  return isBrandRefundCode(code) ? BRAND_REFUND_FAIL_MESSAGES[code] : BRAND_REFUND_FAIL_MESSAGES.DB_ERROR;
}

/** 브랜드 환불 사유 폼 — cleanText 는 서버에서, 여기서는 길이만 (토스 cancelReason 200자) */
export const BRAND_REFUND_REASON_MAX = 200;
export const BRAND_REFUND_DEFAULT_REASON = "브랜드 환불 처리";
