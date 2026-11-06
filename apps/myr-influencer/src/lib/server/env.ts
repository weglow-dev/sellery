/**
 * 서버 환경값 → 공용 패키지 `@sellery/myr-core` 에 1회 주입 (샵 `apps/myr-shop/src/lib/server/env.ts` 와 같은 관례).
 * `$env` 는 여기서만 읽는다. hooks.server.ts 와 `$lib/server/*` 재수출 파일이 이 모듈을 import 하므로 요청을 처리하기 전에 주입이 끝난다.
 * 값이 비어 있어도 실패하지 않는다(키 없는 로컬 · CI 더미) — service role 이 필요한 호출 시점에만 throw.
 *   - 메일 링크는 고객이 여는 **샵** 주소라 `PUBLIC_MYR_SHOP_URL`(없으면 패키지 기본값 myr-shop.vercel.app) — 콘솔 자기 주소가 아니다.
 *   - 메일 키는 문의 답변(5번) · 교환/환불 승인(7번) 메일에 쓴다. **토스 시크릿 키는 넣지 않는다** — 교환/환불 승인 뒤 환불은 샵 크론이 한다(결제 키는 샵에만 · 2026-11-06 대표 결정).
 */
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { configureMyrCore } from '@sellery/myr-core/server/config';

configureMyrCore({
	supabaseUrl: PUBLIC_SUPABASE_URL,
	serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
	resendApiKey: env.RESEND_API_KEY,
	resendApiUrl: env.RESEND_API_URL,
	mailFrom: env.MAIL_FROM,
	shopUrl: pub.PUBLIC_MYR_SHOP_URL
});
