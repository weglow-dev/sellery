/**
 * `@sellery/db/server/partner/*` 배럴 — 콘솔 page load · form action · `auth/*` 라우트가 게이트·가입 생성·Slack 을 쓰는 유일한 입구
 * (docs/monorepo-migration.md §3.3 · §5.2). `$lib/server/` 라 브라우저 도달 코드에서는 import 할 수 없다.
 *   requireSeller(event, { next })  → { ok, ctx } | { ok:false, state, location } — 앱이 `redirect(303, location)` 한다(§2.2 · §2.4)
 *   getSellerContext(event)         → anon · foreign · guest · suspended · ok (요청당 1회 메모)
 *   createSellerFromSignup(user, form?) · linkSellerIdOf(user) · notifySlack(text) · rateLimit(key)
 *   3단계(0011): listProductsForSeller · getProductForSeller · requestFreeSample · listSellerCampaigns · getSellerCampaign · receiveSample
 *              · getHomeWidgets(seller, balance) · saveSampleAddress — 순수 규칙(버튼 문구 · 배송지 검증 · 칩)은 `@sellery/db/partner/sample-rules`
 */
import './env';

export * from '@sellery/db/server/partner/seller';
export * from '@sellery/db/server/partner/signup';
export * from '@sellery/db/server/partner/slack';
export * from '@sellery/db/server/partner/products';
export * from '@sellery/db/server/partner/campaigns';
export * from '@sellery/db/server/partner/home';
export * from '@sellery/db/server/partner/my';
