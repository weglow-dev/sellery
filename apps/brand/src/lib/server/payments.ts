/**
 * `@sellery/payments/server/*` 배럴 — 브랜드 환불(`/brand/orders` `?/refund`)이 이 모듈을 통해서만 토스 취소를 부른다
 * (apps/shop · apps/influencer 의 `$lib/server/payments.ts` 와 같은 패턴 · docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번).
 * `$lib/server/` 라 브라우저 도달 코드가 import 하면 SvelteKit 이 빌드를 실패시킨다.
 * 설정 주입(`configurePayments({ secretKey })`)은 `./env` 가 한다 — 이 배럴을 import 하면 같이 실린다. `TOSS_SECRET_KEY` 가 비면 취소 시점에 CANCEL_FAILED.
 *   refundOrderAsBrand(brandId, orderCode, reason)  → 0018 app_brand_refund_precheck → 토스 전액 취소 → 0008 app_refund_record(actor 'brand') → payment_events
 */
import './env';

export * from '@sellery/payments/server/config';
export * from '@sellery/payments/server/brand-refund';
