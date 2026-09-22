/**
 * `@sellery/db/server/*` 배럴 — 서버 파일(`+*.server.ts` · `+server.ts` · hooks)은 이 모듈을 통해서만 서버 전용 함수를 쓴다
 * (docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번). `$lib/server/` 라 브라우저 도달 코드가 import 하면 SvelteKit 이 빌드를 실패시킨다.
 * 설정 주입(`configureDb`)은 `./env` 가 한다 — 이 배럴을 import 하면 같이 실린다.
 * 파트너 가입 생성(`createSellerFromSignup` · `linkSellerIdOf`)은 `/auth/{callback,confirm}` 의 파트너 분기가 쓴다 (결정 15).
 * 비회원 주문(`createGuestCustomer` · `lookupGuestOrder` · `issueGuestToken` · `verifyGuestOrder` · `fetchGuestOrder` — 0021 · `/checkout` `/orders/lookup` `/orders/g/[code]` · 결제 API 비회원 분기)도 여기서.
 * 고객 문의(`openCs` · `getCsThread` · `customerReplyCs` · `listCsForUser` — 0018 · `/cs/new` `/cs/[code]` · `/account/orders`)와 캠페인 스케줄러(`runCampaignTick` — `/api/cron/campaign-tick`)도 여기서.
 */
import './env';

export { SITE_URL, absoluteUrl } from './env';

export * from '@sellery/db/server/config';
export * from '@sellery/db/server/admin';
export * from '@sellery/db/server/auth';
export * from '@sellery/db/server/event';
export * from '@sellery/db/server/linkctx';
export * from '@sellery/db/server/campaign';
export * from '@sellery/db/server/customers';
export * from '@sellery/db/server/orders';
export * from '@sellery/db/server/guest-order';
export * from '@sellery/db/server/cs';
export * from '@sellery/db/server/campaign-tick';
export { createSellerFromSignup, linkSellerIdOf } from '@sellery/db/server/partner/signup';
// 고객 문의 접수 · 추가 문의 레이트리밋(IP · 회원) — 파트너 콘솔과 같은 메모리 버킷 (docs/brand-console-plan.md §8 "CS 접수 레이트리밋")
export { rateLimit, RATE_LIMIT_MESSAGE } from '@sellery/db/server/partner/seller';
export type { SignupResult } from '@sellery/db/server/partner/signup';
