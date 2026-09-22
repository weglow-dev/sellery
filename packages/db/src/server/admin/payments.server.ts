/**
 * 관리자 콘솔 "결제 정합성" — 운영 큐 카운트 (0020 app_admin_payments_health). 읽기만.
 * 처리는 각자의 자리: 만료 세션 = shop 크론(expire_checkout_sessions) · 미처리 이벤트 = payment_events.handled · 샘플 결제 = partner-admin.mjs payments/refund-sample
 * · 부분취소/정산 후 환불 = 운영자 수동 조정(docs/app-plan.md §7.3).
 *   getPaymentsHealth() → PaymentsHealth | null · paymentsHealthIssues(h) 는 순수 모듈(`../../admin/settle-rules`)
 */
import { parsePaymentsHealth, type PaymentsHealth } from "../../admin/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { PaymentsHealth } from "../../admin/settle-rules";
export { paymentsHealthIssues } from "../../admin/settle-rules";

export async function getPaymentsHealth(admin: Admin = createAdminClient()): Promise<PaymentsHealth | null> {
  const { data, error } = await admin.rpc("app_admin_payments_health");
  if (error) {
    console.error("[admin/payments] app_admin_payments_health failed:", error.message);
    return null;
  }
  return parsePaymentsHealth(data);
}
