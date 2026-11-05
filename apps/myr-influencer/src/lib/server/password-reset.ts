/**
 * 비밀번호 재설정 메일 요청 — 로그인 화면 "비밀번호를 잊으셨나요?"(`/login?/forgot`)와 `/password` 가 같이 부른다.
 * 결과와 무관하게 화면은 "보냈어요"(계정 유무를 드러내지 않는다) — 여기 결과는 로그용.
 *   - 메일 키(RESEND_API_KEY) · 서비스 키가 있으면 **MYR 메일**(`@sellery/myr-core/server/password-reset` — 크리에이터 계정에만)
 *   - 없으면(키 없는 로컬 등) Supabase 기본 메일(셀러리 공용 템플릿 · 로컬은 Mailpit)
 *   - 같은 이메일 10분 3회 · 같은 IP 30분 10회(넘으면 조용히 건너뜀)
 */
import './env';
import { RESET_PER_EMAIL, RESET_PER_IP } from '@sellery/myr-core/password-reset';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { isMailEnabled } from '@sellery/myr-core/server/mail';
import { sendPasswordReset } from '@sellery/myr-core/server/password-reset';

export async function requestPasswordReset(a: { email: string; origin: string; ip: string; supabase: App.Locals['supabase'] }): Promise<void> {
	if (!rateLimit(`reset-ip:${a.ip}`, RESET_PER_IP.max, RESET_PER_IP.windowMs) || !rateLimit(`reset-email:${a.email}`, RESET_PER_EMAIL.max, RESET_PER_EMAIL.windowMs)) {
		console.warn('[password-reset] rate limited');
		return;
	}
	if (isMailEnabled() && hasAdmin()) {
		const r = await sendPasswordReset({ email: a.email, consoleUrl: a.origin });
		if (!r.sent && r.reason !== 'no_user' && r.reason !== 'not_creator') console.warn(`[password-reset] not sent: ${r.reason}`);
		return;
	}
	if (!a.supabase) return;
	const { error } = await a.supabase.auth.resetPasswordForEmail(a.email, { redirectTo: `${a.origin}/auth/confirm?next=${encodeURIComponent('/password/new')}` });
	if (error) console.warn('[password-reset] resetPasswordForEmail:', error.message);
}
