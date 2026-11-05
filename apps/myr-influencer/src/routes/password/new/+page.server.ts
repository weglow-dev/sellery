import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authErrorMessage, parseNewPassword } from '$lib/console-auth';

/**
 * 새 비밀번호 — 재설정 · 초대 메일 링크(/auth/confirm)가 만든 세션으로 들어온다(세션이 없으면 hooks 게이트가 로그인으로).
 * 바꾼 뒤에는 로그아웃시키고 새 비밀번호로 로그인하게 한다 — 메일 링크 세션을 그대로 쓰지 않는다(다른 기기에서 연 링크면 그 기기에 세션이 남지 않게).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	// link=used — 메일 링크는 이미 쓰였지만 로그인된 상태라 여기로 왔다(/auth/confirm linkFailureTarget)
	return { email: user?.email ?? null, linkUsed: url.searchParams.get('link') === 'used' };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const parsed = parseNewPassword(await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		if (!locals.supabase) return fail(503, { message: '로그인 서버 설정이 아직 안 됐어요' });
		const { error } = await locals.supabase.auth.updateUser({ password: parsed.password });
		if (error) {
			console.warn('[password/new] updateUser:', error.message);
			return fail(400, { message: authErrorMessage(error.message) });
		}
		await locals.supabase.auth.signOut();
		redirect(303, '/login?reset=1');
	}
};
