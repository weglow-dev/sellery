/** 공용 패키지 `@sellery/myr-core/server/admin` 재수출 — 구현은 packages/myr-core/src/server/admin.server.ts.
 *  `./env` 를 먼저 불러 패키지 설정(키 · 메일 · 샵 주소)을 넣는다. `$lib/server` 경로라 브라우저 코드가 import 하면 빌드가 막힌다. */
import './env';
export * from '@sellery/myr-core/server/admin';
