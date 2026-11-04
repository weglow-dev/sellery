/**
 * 서버 환경값 → 공용 패키지 `@sellery/myr-core` 에 1회 주입 (셀러리 `apps/shop/src/lib/server/env.ts` 와 같은 관례).
 * `$env` 는 여기서만 읽는다 — 패키지는 `$env` 를 모른다. 아래 `$lib/server/*` 재수출 파일들이 이 모듈을 import 하므로,
 * 라우트가 그 파일을 쓰는 순간 주입이 끝나 있다. 값이 비어 있어도 실패하지 않는다(키 없는 로컬 · CI 더미) — 필요한 호출 시점에만 드러난다.
 */
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { configureMyrCore } from '@sellery/myr-core/server/config';

configureMyrCore({
	supabaseUrl: PUBLIC_SUPABASE_URL,
	serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
	tossSecretKey: env.TOSS_SECRET_KEY,
	resendApiKey: env.RESEND_API_KEY,
	resendApiUrl: env.RESEND_API_URL,
	mailFrom: env.MAIL_FROM,
	// 메일 링크 = 이 샵 주소(SEO canonical 과 같은 PUBLIC_SITE_URL)
	shopUrl: pub.PUBLIC_SITE_URL
});
