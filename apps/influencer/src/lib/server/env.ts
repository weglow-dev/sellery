/**
 * 서버 환경값 — `$env/dynamic/private`(런타임 비밀) 와 `$env/static/public`(빌드 시 인라인) 을 **여기서만** 읽어 패키지에 1회 주입한다
 * (docs/monorepo-migration.md 결정 11 · §2.1 · §3.3 — apps/shop/src/lib/server/env.ts 와 같은 패턴). hooks.server.ts 가 이 모듈을 import 하는 것으로 주입이 끝난다.
 * `$lib/server/` 는 SvelteKit 이 브라우저 도달 코드에서 import 하면 빌드를 실패시킨다 — `import "server-only"` 의 등가물.
 * 값이 비어 있어도 실패하지 않는다(키 없는 로컬 · CI 더미) — service role 이 필요한 호출 시점에만 throw(@sellery/db createAdminClient).
 * 토스 시크릿(`TOSS_SECRET_KEY`)은 4단계 샘플 결제부터 `configurePayments()` 로 주입 — 비어 있으면 호출 시점에 CONFIG_ERROR(@sellery/payments toss.server). Vercel `sellery-influencer` 에도 같은 이름이 필요하다(docs/deploy.md §1.2).
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

/** 고객 사이트 오리진 (약관·처리방침 절대 URL · "← 셀러리 고객 사이트" — web `NEXT_PUBLIC_SITE_URL`). 형식이 어긋나면 로컬 shop dev 주소. */
export const SITE_URL: string = (() => {
	try {
		return new URL(PUBLIC_SITE_URL || 'http://localhost:5176').origin;
	} catch {
		return 'http://localhost:5176';
	}
})();
