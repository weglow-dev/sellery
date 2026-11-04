import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { LINK_ERROR, authErrorMessage, consoleNext, parseLoginForm } from '$lib/console-auth';

/**
 * 크리에이터 콘솔 로그인 — 이메일 + 비밀번호(docs/myr.md §4.2.1 2번 · 샵의 카카오 로그인과 별개).
 * 서버 form action 이 `signInWithPassword` 를 부르고 세션 쿠키를 심는다(JS 없이도 동작 · 비밀번호가 브라우저 Supabase 클라이언트를 거치지 않는다).
 * 이미 로그인했으면 `next`(같은 오리진 경로만 · 기본 홈)로. 연결된 크리에이터가 없거나 정지면 콘솔 게이트가 /unlinked · /suspended 로 보낸다.
 * 가입 화면은 아직 없다(10번) — 계정은 운영팀이 만든다(`packages/db/scripts/myr-creators.mjs`).
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const next = consoleNext(url.searchParams.get('next'));
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, next);
	const err = url.searchParams.get('error');
	return { next, linkError: err ? (LINK_ERROR[err] ?? LINK_ERROR.auth) : null, reset: url.searchParams.get('reset') === '1' };
};

export const actions: Actions = {
	default: async ({ request, url, locals }) => {
		const fd = await request.formData();
		const next = consoleNext(String(fd.get('next') ?? url.searchParams.get('next') ?? ''));
		const parsed = parseLoginForm(fd);
		const email = String(fd.get('email') ?? '').trim();
		if (!parsed.ok) return fail(400, { email, field: parsed.field, message: parsed.message });
		if (!locals.supabase) return fail(503, { email, field: null, message: '로그인 서버 설정이 아직 안 됐어요' });

		const { error } = await locals.supabase.auth.signInWithPassword(parsed.input);
		if (error) {
			console.warn('[login] signInWithPassword:', error.message);
			return fail(400, { email, field: null, message: authErrorMessage(error.message) });
		}
		redirect(303, next);
	}
};
