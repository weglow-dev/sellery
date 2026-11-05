import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { requestPasswordReset } from '$lib/server/password-reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 비밀번호 찾기 — 재설정 메일 요청. 메일 링크는 이 앱의 `/auth/confirm?next=/password/new` 로 돌아온다(redirectTo = 지금 오리진 · Preview 도 자기 주소).
 * 계정이 있는지는 드러내지 않는다 — 결과와 무관하게 같은 "보냈어요" 화면. 메일은 MYR 디자인(lib/server/password-reset · 크리에이터 계정에만 · 레이트리밋).
 */
export const actions: Actions = {
	default: async ({ request, url, locals, getClientAddress }) => {
		const fd = await request.formData();
		const email = String(fd.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!EMAIL_RE.test(email) || email.length > 254) return fail(400, { email, message: '이메일 주소를 확인해주세요' });
		if (!locals.supabase) return fail(503, { email, message: '로그인 서버 설정이 아직 안 됐어요' });
		await requestPasswordReset({ email, origin: url.origin, ip: getClientAddress() });
		return { sent: true, email };
	}
};
