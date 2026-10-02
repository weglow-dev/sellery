/**
 * 판매로 이어지지 않은 샘플 구매 대금 — 순수 모듈(DB 접근 없음).
 * 0024 `app_admin_sample_settle_due` · `app_admin_settle_sample` · `app_admin_sample_refund_due` 의 파서와 문구.
 *
 * 운영 결정(2026-09-28):
 *   · **발송 후** 인플루언서가 진행하지 않으면(패스 · 거절) 샘플 대금을 **브랜드에 지급**한다.
 *     실물을 이미 보냈고, 무상 샘플 경로(등급·월 한도)를 우회하는 통로가 되지 않게 한다.
 *   · 결제 후 **영업일 5일** 안에 발송하지 않으면 **인플루언서에게 전액 환불**한다.
 * 금액 계산은 하지 않는다 — RPC 가 준 값을 표시만 한다(0022 `admin_campaign_pnl` 기준).
 */

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/* ---------------------------------------------------------------- 샘플 대금 정산 대기 ---------------------------------------------------------------- */

export type SampleSettleRow = {
  campaignId: string;
  campaignCode: string | null;
  campaignStatus: string;
  sellerCode: string | null;
  sellerName: string | null;
  sellerHandle: string | null;
  brandCode: string | null;
  brandName: string | null;
  productCode: string | null;
  productName: string | null;
  /** 상품에 환급 옵션이 켜져 있는가 — 켜져 있어도 **판매 미확정이라 환급하지 않는다**(화면이 그 사실을 적는다) */
  productSampleRefund: boolean;
  samplePrice: number;
  sampleCash: number;
  sampleCel: number;
  shippedOn: string | null;
  brandPayout: number;
  sellerPayout: number;
};

function parseParty(raw: unknown): { code: string | null; name: string | null; handle: string | null } {
  const o = obj(raw) ?? {};
  return { code: str(o.code), name: str(o.name), handle: str(o.handle) };
}

export function parseSampleSettleRows(raw: unknown): SampleSettleRow[] {
  const o = obj(raw);
  if (!o || o.ok !== true || !Array.isArray(o.rows)) return [];
  return o.rows.flatMap((r) => {
    const x = obj(r);
    if (!x) return [];
    const s = parseParty(x.seller);
    const b = parseParty(x.brand);
    const p = obj(x.product) ?? {};
    return [
      {
        campaignId: String(x.campaign_id ?? ""),
        campaignCode: str(x.campaign_code),
        campaignStatus: String(x.campaign_status ?? ""),
        sellerCode: s.code,
        sellerName: s.name,
        sellerHandle: s.handle,
        brandCode: b.code,
        brandName: b.name,
        productCode: str(p.code),
        productName: str(p.name),
        productSampleRefund: p.sample_refund === true,
        samplePrice: num(x.sample_price),
        sampleCash: num(x.sample_cash),
        sampleCel: num(x.sample_cel),
        shippedOn: str(x.shipped_on),
        brandPayout: num(x.brand_payout),
        sellerPayout: num(x.seller_payout),
      },
    ];
  });
}

/* ---------------------------------------------------------------- 미발송 환불 대상 ---------------------------------------------------------------- */

export type SampleRefundRow = {
  campaignId: string;
  campaignCode: string | null;
  paymentId: string;
  sellerCode: string | null;
  sellerName: string | null;
  sellerHandle: string | null;
  brandCode: string | null;
  brandName: string | null;
  productCode: string | null;
  productName: string | null;
  amountTotal: number;
  amountCash: number;
  amountCel: number;
  paidOn: string | null;
  dueOn: string | null;
  /** 기한을 며칠 넘겼는가 (0 이면 오늘이 기한) */
  daysOver: number;
};

export type SampleRefundDue = { today: string | null; shipDays: number; rows: SampleRefundRow[] };

export function parseSampleRefundDue(raw: unknown): SampleRefundDue {
  const o = obj(raw);
  if (!o || o.ok !== true) return { today: null, shipDays: 5, rows: [] };
  const rows = (Array.isArray(o.rows) ? o.rows : []).flatMap((r) => {
    const x = obj(r);
    if (!x) return [];
    const s = parseParty(x.seller);
    const b = parseParty(x.brand);
    const p = obj(x.product) ?? {};
    return [
      {
        campaignId: String(x.campaign_id ?? ""),
        campaignCode: str(x.campaign_code),
        paymentId: String(x.payment_id ?? ""),
        sellerCode: s.code,
        sellerName: s.name,
        sellerHandle: s.handle,
        brandCode: b.code,
        brandName: b.name,
        productCode: str(p.code),
        productName: str(p.name),
        amountTotal: num(x.amount_total),
        amountCash: num(x.amount_cash),
        amountCel: num(x.amount_cel),
        paidOn: str(x.paid_on),
        dueOn: str(x.due_on),
        daysOver: num(x.days_over),
      },
    ];
  });
  return { today: str(o.today), shipDays: num(o.ship_days) || 5, rows };
}

/* ---------------------------------------------------------------- 실행 결과 ---------------------------------------------------------------- */

export type SampleSettleResult =
  | { ok: true; already: boolean; settlementId: string | null; brandPayout: number }
  | { ok: false; code: string; status?: string | null };

export function parseSampleSettleResult(raw: unknown): SampleSettleResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true)
    return { ok: true, already: o.already === true, settlementId: str(o.settlement_id), brandPayout: num(o.brand_payout) };
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR", status: str(o.status) };
}

/** 화면이 `?msg=` 로 바꿔 띄운다 */
export const SAMPLE_SETTLE_MESSAGES: Record<string, string> = {
  settled: "샘플 대금을 정산했습니다 — 브랜드 지급 대기에 올라갑니다.",
  already: "이미 정산된 건입니다.",
  err_NOT_FOUND: "캠페인을 찾을 수 없습니다.",
  err_NO_SAMPLE: "샘플 구매가 없는 캠페인입니다.",
  err_NOT_SHIPPED: "샘플이 발송되지 않았습니다 — 발송 전 무산은 인플루언서에게 환불합니다.",
  err_NOT_TERMINAL: "아직 진행 중인 캠페인입니다 — 판매가 끝나면 판매 정산에 함께 지급됩니다.",
  err_REFUNDED: "이미 인플루언서에게 환불된 건입니다.",
  err_CALC_FAILED: "금액을 계산할 수 없습니다.",
  err_DB_ERROR: "처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

export function sampleSettleMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  return SAMPLE_SETTLE_MESSAGES[key] ?? null;
}

/**
 * 미발송 환불 안내 — 실행은 `refundSamplePurchase`(@sellery/payments)가 **토스 현금분 취소 → DB 갱신**을
 * 한 번에 한다(0012 §5.7 순서). 토스 취소가 실패하면 DB 는 건드리지 않는다.
 */
export const SAMPLE_REFUND_NOTICE =
  "영업일 5일이 지난 건이 여기 모입니다 — 자동으로 환불되지 않습니다. 인플루언서가 환불을 요청한 경우에만 누르세요. " +
  "기다리겠다고 하면 그대로 두면 됩니다(브랜드가 발송하면 목록에서 빠집니다). " +
  "환불하면 토스 카드 결제를 먼저 전액 취소하고, 성공한 뒤에만 🥬 복구·캠페인 종결·주문 취소가 기록됩니다. 되돌릴 수 없습니다.";

/** 환불 결과 문구 — `refundSamplePurchase` 의 반환 코드를 사람이 읽는 말로 */
export const SAMPLE_REFUND_MESSAGES: Record<string, string> = {
  refunded: "샘플 구매를 환불했습니다 — 토스 취소 · 🥬 복구 · 캠페인 종결까지 처리했습니다.",
  refund_already: "이미 환불된 결제입니다.",
  err_refund_NOT_FOUND: "결제를 찾을 수 없습니다.",
  err_refund_NOT_REFUNDABLE: "결제 완료 상태가 아니라 환불할 수 없습니다.",
  err_refund_NOT_CANCELABLE: "브랜드가 이미 발송한 건입니다 — 발송 후에는 브랜드에 지급합니다.",
  err_refund_TOSS: "토스 취소에 실패했습니다 — DB 는 바꾸지 않았습니다. 잠시 후 같은 건으로 다시 시도하세요(같은 멱등키라 중복 취소되지 않습니다).",
  err_refund_DB_ERROR: "토스 취소는 됐지만 기록에 실패했습니다 — 같은 건으로 다시 시도하세요.",
};

export function sampleRefundMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  return SAMPLE_REFUND_MESSAGES[key] ?? null;
}
