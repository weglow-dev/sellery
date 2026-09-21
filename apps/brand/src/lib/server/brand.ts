/**
 * 브랜드 콘솔 서버 배럴 — `@sellery/db/server/brand/*` + 인플루언서와 공유하는 유틸(`rateLimit` · `notifySlack`)
 * (docs/brand-console-plan.md §2 — apps/influencer/src/lib/server/partner.ts 의 브랜드 판). 설정 주입은 `./env`.
 *   requireBrand(event, { next })  → { ok, ctx } | { ok:false, state, location } — 앱이 `redirect(303, location)` 한다
 *   getBrandContext(event)         → anon · foreign(kind seller|customer) · guest · suspended · ok (요청당 1회 메모)
 *   createBrandFromSignup(user, form?) · linkBrandIdOf(user) · isBrandAccount(user) · brandPath · consoleNextOf
 *   2단계(0015): listBrandProducts · getBrandProduct · listCategories · upsertBrandProduct · setBrandListing · deleteBrandProduct · uploadProductImage
 *              · listBrandRequests · listBrandCampaigns · getBrandCampaign · approveSample · rejectSample · shipSample
 *   3단계(0016): confirmSchedule · rejectSchedule(`server/brand/schedule`) · listInviteCandidates · inviteSeller(`server/brand/invite`) · sendCampaignChat('brand', …)(`server/partner/chat` — 두 콘솔 공용)
 *   순수 규칙(폼 검증 · 문구 · 칩)은 `@sellery/db/brand/{product-rules,campaign-rules,invite-rules}` · `@sellery/db/partner/chat-rules` 를 .svelte 에서 직접 import.
 */
import './env';

export * from '@sellery/db/server/brand/brand';
export * from '@sellery/db/server/brand/signup';
export * from '@sellery/db/server/brand/products';
export * from '@sellery/db/server/brand/campaigns';
export * from '@sellery/db/server/brand/schedule';
export * from '@sellery/db/server/brand/invite';
export { sendCampaignChat, type ChatRole, type ChatResult, type ChatEvent } from '@sellery/db/server/partner/chat';
export { rateLimit, RATE_LIMIT_MESSAGE } from '@sellery/db/server/partner/seller';
export { linkSellerIdOf } from '@sellery/db/server/partner/signup'; // 인플루언서 세션 판정(foreign) — auth/confirm · login
export * from '@sellery/db/server/partner/slack';
