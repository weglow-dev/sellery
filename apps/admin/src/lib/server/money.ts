/**
 * 관리자 콘솔 "정산 · 돈" 배럴 — `@sellery/db/server/admin/*`(정산 실행 · 지급 · 주문/결제/문의 열람) + `@sellery/payments/server/admin-refund`(관리자 환불).
 * `./db`(세션 · 게이트 · 파트너 관리 — 다른 작업자) 와 나란히 두는 **별도 배럴**이다: 돈을 움직이는 함수는 이 파일을 거쳐서만 import 한다
 * (docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번 · apps/brand `$lib/server/payments.ts` 와 같은 패턴). `$lib/server/` 라 브라우저 도달 코드가 import 하면 빌드 실패.
 *
 * 비밀 주입: `./env` 가 `configureDb({ url, anonKey, serviceKey, slackWebhookUrl })` 를 끝낸 뒤, 여기서 **돈 쪽에만 필요한 두 개**를 추가로 넣는다 —
 *   `configurePayments({ secretKey: TOSS_SECRET_KEY })`(관리자 환불 → 토스 취소 · 없으면 CANCEL_FAILED) · `configureDb({ rrnEncKey: RRN_ENC_KEY })`(지급명세서 자료 복호 · 없으면 RRN_KEY_MISSING)
 *   · `configurePayouts({ TOSS_PAYOUT_SECRET_KEY, TOSS_PAYOUT_SECURITY_KEY })`(토스 지급대행 0040 — 잔액 · 지급 요청 · 셀러 동기화).
 *   `configureDb` 는 넘긴 키만 갱신하므로 `./env` 가 넣은 값은 그대로다. Vercel `sellery-admin` 에 추가되는 이름: `TOSS_SECRET_KEY` · `RRN_ENC_KEY`(둘 다 선택) · `TOSS_PAYOUT_*`(지급대행 켤 때 필수 — docs/deploy.md §1.2).
 *
 *   previewSettlement · runSettlement · runDueSettlements · listAdminSettlements · markPayoutPaid · holdPayout · releasePayout · exportPayouts · exportRrn
 *   getAdminRevenue · saveOpex — 매출·순수익(0022 app_admin_revenue · app_admin_save_opex)
 *   listSampleSettleDue · settleSampleAsAdmin · listSampleRefundDue — 샘플 구매 대금(0024)
 *   listAdminOrders · getAdminOrder · getPaymentsHealth · paymentsHealthIssues · listAdminCs · getAdminCsThread · refundOrderAsAdmin
 */
import './env';
import { env } from '$env/dynamic/private';
import { configureDb } from '@sellery/db/server/config';
import { configurePayments, configurePayouts } from '@sellery/payments/server/config';

configurePayments({ secretKey: env.TOSS_SECRET_KEY });
configureDb({ rrnEncKey: env.RRN_ENC_KEY });
// 토스 지급대행(0040) — `TOSS_PAYOUT_SECRET_KEY` · `TOSS_PAYOUT_SECURITY_KEY`(admin 필수 · 지급 요청/잔액). 없으면 `payoutTossOverview` 가 configured:false, 요청은 NOT_CONFIGURED.
configurePayouts({ secretKey: env.TOSS_PAYOUT_SECRET_KEY, securityKey: env.TOSS_PAYOUT_SECURITY_KEY });

export * from '@sellery/db/server/admin/settle';
export * from '@sellery/db/server/admin/orders';
export * from '@sellery/db/server/admin/payments';
export * from '@sellery/db/server/admin/revenue';
export * from '@sellery/db/server/admin/sample';
export * from '@sellery/db/server/admin/cs';
export * from '@sellery/payments/server/admin-refund';
// 토스 지급대행(0040) — getPayoutMode · setPayoutMode · payoutTossOverview · requestDuePayouts · cancelTossPayout · refreshTossPayout · syncPayeeWithToss
export * from '@sellery/payments/server/payouts';
// 샘플 결제 환불 — 토스 현금분 취소 → app_partner_payment_refund 까지 한 함수가 한다(0012 §5.7 순서 보장)
export { refundSamplePurchase } from '@sellery/payments/server/partner-sample';
// 폼 액션 레이트리밋 — 인플루언서·브랜드 콘솔과 같은 유틸(프로세스 메모리 · 30분 20건). 게이트(`./admin` requireAdmin) 뒤에서만.
export { rateLimit, RATE_LIMIT_MESSAGE } from '@sellery/db/server/partner/seller';
