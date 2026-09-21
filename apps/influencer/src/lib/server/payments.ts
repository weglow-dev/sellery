/**
 * `@sellery/payments/server/*` 배럴 — 샘플 결제 라우트(`/pay/new` · `/pay/[id]` · `/pay/success` · `/pay/fail`)는 이 모듈을 통해서만
 * 토스 API·파트너 결제 동기화 함수를 쓴다 (apps/shop/src/lib/server/payments.ts 와 같은 패턴 · docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번).
 * `$lib/server/` 라 브라우저 도달 코드가 import 하면 SvelteKit 이 빌드를 실패시킨다.
 * 설정 주입(`configurePayments({ secretKey })`)은 `./env` 가 한다 — 이 배럴을 import 하면 같이 실린다. `TOSS_SECRET_KEY` 가 비면 토스 호출 시점에 CONFIG_ERROR.
 */
import './env';

export * from '@sellery/payments/server/config';
export * from '@sellery/payments/server/toss';
export * from '@sellery/payments/server/partner-sample';
