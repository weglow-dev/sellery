/**
 * 금액 · 토스 orderId — 계약 docs/app-plan.md §10.0. 소유: E.
 *
 * 가격 계산 규칙은 여기 없다 — 단가는 campaign_card().product.options 가 단일 소스(app-plan §0 결정 9).
 */

/** 29900 → '29,900원' (표시는 화면 규칙에 따라 '₩' 리터럴을 앞에 붙이기도 한다 — ux-spec §1.6) */
export function formatKRW(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return `${v.toLocaleString("ko-KR")}원`;
}

/**
 * 토스 orderId: `slry_${Date.now()}_${uuid 12자}` — 6~64자 [A-Za-z0-9_-] (checkout_sessions.toss_order_id check).
 * 예: slry_1789876543210_3f9a1c2b7d4e (31자). glo `glo_${ts}_${uuid 8자}` 와 같은 꼴, 접두사·길이만 다르다.
 */
export function generateOrderId(): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `slry_${Date.now()}_${rand}`;
}
