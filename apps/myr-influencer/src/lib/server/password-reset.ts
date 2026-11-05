/**
 * 비밀번호 재설정 메일 요청 — 로그인 화면 "비밀번호를 잊으셨나요?"(`/login?/forgot`)와 `/password` 가 같이 부른다.
 * 결과와 무관하게 화면은 "보냈어요"(계정 유무를 드러내지 않는다) — 여기 결과는 로그용.
 *   - **MYR 메일만** 보낸다(`@sellery/myr-core/server/password-reset` — 크리에이터 계정에만). Supabase 기본 메일로 대체하지 않는다(2026-11-05 — 셀러리 운영 중단)
 *   - 메일 키(RESEND_API_KEY) · 서비스 키가 없으면 보내지 않고 서버 로그만 — 로컬 확인은 admin generateLink(recovery) 의 hashed_token 으로 /auth/confirm 을 직접 연다(docs/deploy.md)
 *   - 같은 이메일 10분 3회 · 같은 IP 30분 10회(넘으면 조용히 건너뜀)
 */
import './env';
import { RESET_PER_EMAIL, RESET_PER_IP } from '@sellery/myr-core/password-reset';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { isMailEnabled } from '@sellery/myr-core/server/mail';
import { sendPasswordReset } from '@sellery/myr-core/server/password-reset';

export async function requestPasswordReset(a: { email: string; origin: string; ip: string }): Promise<void> {
	if (!rateLimit(`reset-ip:${a.ip}`, RESET_PER_IP.max, RESET_PER_IP.windowMs) || !rateLimit(`reset-email:${a.email}`, RESET_PER_EMAIL.max, RESET_PER_EMAIL.windowMs)) {
		console.warn('[password-reset] rate limited');
		return;
	}
	if (!isMailEnabled() || !hasAdmin()) {
		console.error('[password-reset] RESEND_API_KEY · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 — 재설정 메일을 보내지 않았어요(docs/deploy.md 크리에이터 콘솔 절)');
		return;
	}
	const r = await sendPasswordReset({ email: a.email, consoleUrl: a.origin });
	if (!r.sent && r.reason !== 'no_user' && r.reason !== 'not_creator') console.warn(`[password-reset] not sent: ${r.reason}`);
}
