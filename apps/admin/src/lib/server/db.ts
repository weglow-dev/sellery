/**
 * `@sellery/db/server/*` 배럴 — 서버 파일(`+*.server.ts` · `+server.ts` · hooks)은 이 모듈을 통해서만 서버 전용 함수를 쓴다
 * (docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번 · apps/brand/src/lib/server/db.ts 와 동일).
 * 설정 주입(`configureDb`)은 `./env` 가 한다 — 이 배럴을 import 하면 같이 실린다. 관리자 게이트는 `./admin`.
 */
import './env';

export { SITE_URL } from './env';

export * from '@sellery/db/server/config';
export * from '@sellery/db/server/admin';
export * from '@sellery/db/server/auth';
