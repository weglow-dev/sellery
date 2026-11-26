import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { META_STATE_COOKIE } from '@sellery/db/admin/meta-connect';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { completeMetaConnect, sameMetaState } from '$lib/server/outreach';
import { META_FAIL_MSG } from '../../messages';

/**
 * `/outreach/meta/callback` — Facebook 로그인 창이 돌아오는 곳(메타 앱 "유효한 OAuth 리디렉션 URI" 에 등록한 주소).
 * 순서: 관리자 게이트 → state 쿠키 대조(쿠키는 한 번 쓰고 지운다) → 취소 여부 → `code` 로 연결 완료(토큰 교환 · 검증 · 암호화 저장) → `/outreach` 로.
 * 토큰·code 는 응답·리다이렉트 주소에 싣지 않는다. 운영자(actor)는 서버 세션에서만 읽는다.
 */
function back(msg: string, detail?: string | null): string {
	const p = new URLSearchParams({ msg });
	if (detail) p.set('detail', detail);
	return `${adminPath('/outreach')}?${p.toString()}`;
}

export const GET: RequestHandler = async (event) => {
	// 세션이 없으면 code 를 들고 로그인으로 돌지 않는다 — 로그인 뒤 목록으로 가서 다시 누르게 한다
	const gate = await requireAdmin(event, { next: adminPath('/outreach') });
	if (!gate.ok) redirect(303, gate.location);

	const expected = event.cookies.get(META_STATE_COOKIE);
	event.cookies.delete(META_STATE_COOKIE, { path: adminPath('/') });
	const q = event.url.searchParams;
	if (!sameMetaState(expected, q.get('state'))) redirect(303, back('meta_state'));
	if (q.get('error')) redirect(303, back('meta_denied'));
	const code = q.get('code');
	if (!code) redirect(303, back('meta_state'));

	const r = await completeMetaConnect({ code, actor: gate.ctx.user.email ?? null });
	if (!r.ok) redirect(303, back(META_FAIL_MSG[r.code], r.error));
	redirect(303, back('meta_connected', `@${r.connection.igUsername ?? r.connection.igUserId}`));
};
