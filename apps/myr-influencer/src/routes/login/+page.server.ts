import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestPasswordReset } from '$lib/server/password-reset';
import { EMAIL_RE, LINK_ERROR, SESSION_ONLY_COOKIE, authErrorMessage, consoleNext, parseLoginForm } from '$lib/console-auth';

/**
 * 크리에이터 콘솔 로그인 — 이메일 + 비밀번호(docs/myr.md §4.2.1 2번 · 시안 "MYR Influencer Login" · "… PC").
 * 서버 form action 이 처리한다(JS 없이도 동작 · 비밀번호가 브라우저 Supabase 클라이언트를 거치지 않는다).
 *   login    로그인 — `signInWithPassword` · "이 기기에서 로그인 유지"를 끄면 세션 쿠키를 브라우저 종료 때 지워지게(hooks 가 SESSION_ONLY_COOKIE 를 본다)
 *   forgot   비밀번호 찾기 — 로그인 칸에 적은 이메일로 재설정 메일(시안: 버튼을 누르면 바로 보내고 토스트). 계정 유무는 드러내지 않는다 · MYR 메일(lib/server/password-reset)
 * 이미 로그인했으면 `next`(같은 오리진 경로만 · 기본 홈)로. 가입은 초대 링크(/invite/<토큰>)로만.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const next = consoleNext(url.searchParams.get('next'));
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, next);
	const err = url.searchParams.get('error');
	return { next, linkError: err ? (LINK_ERROR[err] ?? LINK_ERROR.auth) : null, reset: url.searchParams.get('reset') === '1' };
};

export const actions: Actions = {
	// 이름 있는 액션(forgot)과 default 는 같이 둘 수 없다(SvelteKit — 섞으면 POST 가 500) → 둘 다 이름으로
	login: async ({ request, url, locals, cookies }) => {
		const fd = await request.formData();
		const next = consoleNext(String(fd.get('next') ?? url.searchParams.get('next') ?? ''));
		const remember = fd.get('remember') === '1';
		const parsed = parseLoginForm(fd);
		const email = String(fd.get('email') ?? '').trim();
		if (!parsed.ok) return fail(400, { action: 'login' as const, email, remember, field: parsed.field, message: parsed.message });
		if (!locals.supabase) return fail(503, { action: 'login' as const, email, remember, field: null, message: '로그인 서버 설정이 아직 안 됐어요' });

		// 로그인 유지를 껐으면 이번 요청에서 심는 세션 쿠키부터 만료 시각 없이(hooks setAll 이 읽는다) — 이후 갱신도 이 쿠키를 보고 같게
		locals.sessionOnly = !remember;
		if (remember) cookies.delete(SESSION_ONLY_COOKIE, { path: '/' });
		else cookies.set(SESSION_ONLY_COOKIE, '1', { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev });

		const { error } = await locals.supabase.auth.signInWithPassword(parsed.input);
		if (error) {
			console.warn('[login] signInWithPassword:', error.message);
			return fail(400, { action: 'login' as const, email, remember, field: null, message: authErrorMessage(error.message) });
		}
		redirect(303, next);
	},

	forgot: async ({ request, url, locals, getClientAddress }) => {
		const fd = await request.formData();
		const email = String(fd.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!EMAIL_RE.test(email) || email.length > 254) {
			return fail(400, { action: 'forgot' as const, email, remember: fd.get('remember') === '1', field: 'email' as const, message: '먼저 가입한 이메일을 입력해주세요' });
		}
		if (!locals.supabase) return fail(503, { action: 'forgot' as const, email, remember: true, field: null, message: '로그인 서버 설정이 아직 안 됐어요' });
		await requestPasswordReset({ email, origin: url.origin, ip: getClientAddress(), supabase: locals.supabase });
		return { action: 'forgot' as const, sent: true, email, remember: fd.get('remember') === '1' };
	}
};
