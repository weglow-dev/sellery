import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSettleBody, settleSaveMessage } from '@sellery/myr-core/settle-info';
import { saveSettleInfoOfUser } from '$lib/server/settle-info';
import { apiSeller } from '$lib/server/seller';
import { hasTossPayouts, linkTossSeller } from '$lib/server/toss-sellers';

/**
 * 사업자 · 정산 정보 저장(9번 · 0085) — 내 정보 `/my` 가 부른다(초대 가입은 폼 action 이 같은 서버 함수를 부른다).
 *   POST { company, ceo, bizNo?, bank, account?, holder, ceoPhone, tossAgreed } → { ok, recheck, tossAction, info } · 실패 { ok:false, code, field?, message }
 *   bizNo · account 가 비면 저장된 값 그대로(화면은 가린 값만 가진다). 칸 규칙은 RPC 가 다시 본다.
 * 저장 뒤 토스 셀러에 할 일은 서버가 정한다(0121 toss_action · 2026-11-18 결정) — register (다시) 등록 → 새로 본인인증 · update 셀러 수정(인증 유지).
 *   토스 호출 결과는 info 의 카드 상태(toss_state)로 돌아온다(0124 · 실패해도 저장은 그대로). ⚠ 수정 뒤 토스가 다시 본인인증을 요구하면 웹훅으로 상태가 바뀐다.
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
	if (r.tossAction && hasTossPayouts()) {
		const t = await linkTossSeller(seller.id, r.tossAction);
		if (!t.ok) console.warn('[my/settle] toss link:', t.code);
		if (t.info) return json({ ...r, info: t.info });
	}
	return json(r);
};
