/**
 * 브랜드 콘솔 서버 배럴 — `@sellery/db/server/brand/*` + 인플루언서와 공유하는 유틸(`rateLimit` · `notifySlack`)
 * (docs/brand-console-plan.md §2 — apps/influencer/src/lib/server/partner.ts 의 브랜드 판). 설정 주입은 `./env`.
 *   requireBrand(event, { next })  → { ok, ctx } | { ok:false, state, location } — 앱이 `redirect(303, location)` 한다
 *   getBrandContext(event)         → anon · foreign(kind seller|customer) · guest · suspended · ok (요청당 1회 메모)
 *   createBrandFromSignup(user, form?) · linkBrandIdOf(user) · isBrandAccount(user) · brandPath · consoleNextOf
 *   2단계부터: products · campaigns(샘플 승인·거절·발송) — `@sellery/db/server/brand/{products,campaigns}` 를 여기서 export
 */
import './env';

export * from '@sellery/db/server/brand/brand';
export * from '@sellery/db/server/brand/signup';
export { rateLimit, RATE_LIMIT_MESSAGE } from '@sellery/db/server/partner/seller';
export { linkSellerIdOf } from '@sellery/db/server/partner/signup'; // 인플루언서 세션 판정(foreign) — auth/confirm · login
export * from '@sellery/db/server/partner/slack';
