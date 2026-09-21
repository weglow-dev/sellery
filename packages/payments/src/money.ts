/**
 * 금액 · 토스 orderId — web/src/lib/money.ts 그대로 (계약 docs/app-plan.md §10.0). 순수 — 브라우저·서버·vitest.
 *
 * 가격 계산 규칙은 여기 없다 — 단가는 campaign_card().product.options 가 단일 소스(app-plan §0 결정 9).
 *
 * orderId 접두는 **이 상수 하나**가 정본이다(docs/inf-console-plan.md §5.6):
 *   - 고객 결제 `slry_` — checkout_sessions.toss_order_id 의 check 는 형식(`^[A-Za-z0-9_-]{6,64}$`, 0008)만 검사한다. 접두는 코드만 보장.
 *   - 파트너 결제 `slrp_` — partner_payments.toss_order_id 의 check(`^slrp_[A-Za-z0-9_-]{6,59}$`, 0012)가 이 값을 참조한다.
 *   웹훅(/api/payments/webhook) 매칭 순서: orderId 가 `slrp_` 로 시작 → partner_payments, 아니면 checkout_sessions.
 *   paymentKey 만 온 경우 checkout_sessions.payment_key → orders.payment_key → partner_payments.payment_key 순.
 */

export type OrderIdKind = "customer" | "partner";

/** 토스 orderId 접두 — customer `slry_`(checkout_sessions) · partner `slrp_`(partner_payments) */
export const ORDER_ID_PREFIX = { customer: "slry_", partner: "slrp_" } as const;

/** partner_payments.toss_order_id check (0012) 와 같은 식 */
export const PARTNER_ORDER_ID_RE = /^slrp_[A-Za-z0-9_-]{6,59}$/;
/** 고객 orderId — DB 는 접두를 강제하지 않는다(위 주석). 코드 판정용 */
export const CUSTOMER_ORDER_ID_RE = /^slry_[A-Za-z0-9_-]{6,59}$/;

/** 29900 → '29,900원' (표시는 화면 규칙에 따라 '₩' 리터럴을 앞에 붙이기도 한다 — ux-spec §1.6) */
export function formatKRW(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `${v.toLocaleString("ko-KR")}원`;
}

/**
 * 토스 orderId: `${접두}${Date.now()}_${uuid 12자}` — 6~64자 [A-Za-z0-9_-] (checkout_sessions / partner_payments 의 check).
 * 예: slry_1789876543210_3f9a1c2b7d4e · slrp_1789876543210_3f9a1c2b7d4e (31자). glo `glo_${ts}_${uuid 8자}` 와 같은 꼴, 접두사·길이만 다르다.
 *
 *   generateOrderId()                 → 고객 (slry_) — 기존 호출 그대로
 *   generateOrderId(now)              → 고객, 시각 고정(테스트)
 *   generateOrderId('partner')        → 파트너 (slrp_)
 *   generateOrderId('partner', now)
 */
export function generateOrderId(kindOrNow?: OrderIdKind | number, now?: number): string {
  const kind: OrderIdKind = typeof kindOrNow === "string" ? kindOrNow : "customer";
  const ts = typeof kindOrNow === "number" ? kindOrNow : (now ?? Date.now());
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${ORDER_ID_PREFIX[kind]}${ts}_${rand}`;
}

/** `slrp_…` 파트너 결제 orderId 인가 (형식까지 — DB check 와 동일) */
export function isPartnerOrderId(id: unknown): id is string {
  return typeof id === "string" && PARTNER_ORDER_ID_RE.test(id);
}

/** `slry_…` 고객 결제 orderId 인가 */
export function isCustomerOrderId(id: unknown): id is string {
  return typeof id === "string" && CUSTOMER_ORDER_ID_RE.test(id);
}

/** 접두로 종류 판정 — 둘 다 아니면 null (웹훅은 null 을 "모르는 주문" 이 아니라 세션 조회로 넘긴다: 옛 형식·시드 대비) */
export function orderIdKind(id: unknown): OrderIdKind | null {
  if (isPartnerOrderId(id)) return "partner";
  if (isCustomerOrderId(id)) return "customer";
  return null;
}
