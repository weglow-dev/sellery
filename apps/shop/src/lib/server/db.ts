/**
 * `@sellery/db/server/*` 배럴 — 서버 파일(`+*.server.ts` · `+server.ts` · hooks)은 이 모듈을 통해서만 서버 전용 함수를 쓴다
 * (docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번). `$lib/server/` 라 브라우저 도달 코드가 import 하면 SvelteKit 이 빌드를 실패시킨다.
 * 설정 주입(`configureDb`)은 `./env` 가 한다 — 이 배럴을 import 하면 같이 실린다.
 * 파트너 가입 생성(`createSellerFromSignup` · `linkSellerIdOf`)은 `/auth/{callback,confirm}` 의 파트너 분기가 쓴다 (결정 15).
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
export { createSellerFromSignup, linkSellerIdOf } from '@sellery/db/server/partner/signup';
export type { SignupResult } from '@sellery/db/server/partner/signup';
