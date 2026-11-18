import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSettleBody, settleSaveMessage } from '@sellery/myr-core/settle-info';
import { saveSettleInfoOfUser } from '$lib/server/settle-info';
import { apiSeller } from '$lib/server/seller';
import { simRegister, tossSimAllowed } from '$lib/server/toss-sim';

/**
 * 사업자 · 정산 정보 저장(9번 · 0085) — 내 정보 `/my` · 초대 가입 2단계가 부른다.
 *   POST { company, ceo, bizNo?, bank, account?, holder } → { ok, recheck, info } · 실패 { ok:false, code, field?, message }
 *   bizNo · account 가 비면 저장된 값 그대로(화면은 가린 값만 가진다). 칸 규칙은 RPC 가 다시 본다.
 * 크리에이터 · 계정은 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const body = parseSettleBody(await event.request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_REQUEST', ...settleSaveMessage('BAD_REQUEST') }, { status: 400 });
	const r = await saveSettleInfoOfUser(user.id, body);
	if (!r.ok) return json({ ok: false, code: r.code, ...settleSaveMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 400 });
	// 가짜 토스(개발 서버 · Vercel Preview 만) — 토스에 할 일은 서버가 정한다(0121 toss_action · 2026-11-18 결정).
	//   register = (다시) 등록 → 새로 본인인증 · update = 셀러 수정(인증 유지 — 가짜 토스는 상태를 그대로 둔다).
	//   연동 뒤에는 이 자리에서 실제 토스 셀러 등록 · 수정을 한다. ⚠ 수정 뒤 토스가 다시 본인인증을 요구하는지는 문서에 없다 — 요구하면 웹훅으로 상태가 바뀐다
	if (tossSimAllowed() && r.tossAction === 'register') {
		const info = await simRegister(seller.id, r.info);
		if (info) return json({ ...r, info });
	}
	return json(r);
};
