/**
 * 서버 환경값 — `$env/dynamic/private`(런타임 비밀) 와 `$env/static/public`(빌드 시 인라인) 을 **여기서만** 읽어 패키지에 1회 주입한다
 * (docs/monorepo-migration.md 결정 11 · apps/influencer/src/lib/server/env.ts 와 같은 패턴). hooks.server.ts 가 이 모듈을 import 하는 것으로 주입이 끝난다.
 * `$lib/server/` 는 SvelteKit 이 브라우저 도달 코드에서 import 하면 빌드를 실패시킨다 — `import "server-only"` 의 등가물.
 * 값이 비어 있어도 실패하지 않는다(키 없는 로컬 · CI 더미) — service role 이 필요한 호출 시점에만 throw(@sellery/db createAdminClient).
 * `RRN_ENC_KEY` 는 브랜드 콘솔에 없다(주민번호는 브랜드에 없음). 토스 시크릿(`TOSS_SECRET_KEY`)은 4단계 브랜드 환불(토스 취소 · @sellery/payments brand-refund)에만 쓰인다 —
 * 비면 환불 시점에 CONFIG_ERROR(CANCEL_FAILED), 나머지 화면은 영향 없음.
 * Vercel `sellery-brand` 에 필요한 이름: `SUPABASE_SERVICE_ROLE_KEY`(필수) · `TOSS_SECRET_KEY`(환불 · shop 과 같은 값) · `SLACK_WEBHOOK_URL`(선택) — docs/deploy.md §1.2.
 */
import { env } from '$env/dynamic/private';
import { PUBLIC_SITE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { configureDb } from '@sellery/db/server/config';
import { configurePayments } from '@sellery/payments/server/config';

configureDb({
	url: PUBLIC_SUPABASE_URL,
	anonKey: PUBLIC_SUPABASE_ANON_KEY,
	serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
	slackWebhookUrl: env.SLACK_WEBHOOK_URL
});

configurePayments({ secretKey: env.TOSS_SECRET_KEY });

/** 고객 사이트 오리진 (약관·처리방침 절대 URL · "← 셀러리 고객 사이트"). 형식이 어긋나면 로컬 shop dev 주소. */
export const SITE_URL: string = (() => {
	try {
		return new URL(PUBLIC_SITE_URL || 'http://localhost:5176').origin;
	} catch {
		return 'http://localhost:5176';
	}
})();
