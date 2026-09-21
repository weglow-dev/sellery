/**
 * 공유 타입 — 파티션 간 계약 (docs/app-plan.md §10.0). 소유: C.
 *
 * 배송지 키는 orders.shipping · checkout_sessions.shipping · customers.address jsonb 와
 * 동일하다 (0004 주석 · 0008). phone 은 normalizePhone() 통과값(숫자만 8~15자리).
 */
export type Shipping = {
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2?: string;
  memo?: string;
};

/** campaign_card() 가 응답하는 캠페인 상태 — 그 외 상태·없는 코드는 RPC 가 null 을 준다 */
export type CampaignStatus = "SCHEDULE_CONFIRMED" | "LIVE" | "CLEARING" | "SETTLED";

/** orders.status (0004). CANCELED 는 슬라이스 1 부터 "돈은 돌아갔으나 정산 후·샘플" 조정 큐 (app-plan §5) */
export type OrderStatus = "PAID" | "REFUNDED" | "CANCELED";

/** checkout_sessions.status (0008) */
export type CheckoutSessionStatus =
  | "PENDING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";
