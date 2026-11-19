import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiSeller } from '$lib/server/seller';
import { getSettleInfoOfUser } from '$lib/server/settle-info';
import { invitePreviewAllowed } from '$lib/server/invite-preview';
import { previewTossCardCheck, tossCardOf } from '$lib/server/toss-auth';
import { hasTossPayouts, refreshTossSeller } from '$lib/server/toss-sellers';
import { isTossCardState } from '$lib/toss-card';

const NOT_NOW = '지금은 확인하지 못했어요. 잠시 후 다시 눌러 주세요';

/**
 * 내 정보 "토스 본인인증" [인증을 마쳤어요] — POST { preview?, attempt } → { ok, toss }.
 *   preview(주소 ?toss= · 개발 서버 · Vercel Preview 만)가 있으면 미리보기 목 · 없으면 이 계정의 토스 셀러를 다시 조회해 상태를 적고(0124) 카드를 돌려준다.
 *   카드 상태 · 문구는 서버 값(0121 myr_toss_card_state · tossCardOf) — 확인했는데 상태가 그대로면 "아직 인증 전" 안내(notYet).
 * 지급대행 키가 없으면 NOT_READY. 크리에이터는 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const body = (await event.request.json().catch(() => null)) as { preview?: unknown; attempt?: unknown } | null;
	const { user } = await event.locals.safeGetSession();
	const info = user ? await getSettleInfoOfUser(user.id) : null;
	if (invitePreviewAllowed() && isTossCardState(body?.preview)) return json({ ok: true, toss: previewTossCardCheck(body.preview, Number(body.attempt) || 1, info) });
	if (!hasTossPayouts()) return json({ ok: false, code: 'NOT_READY', message: '토스 본인인증은 아직 준비 중이에요' }, { status: 404 });
	if (!info) return json({ ok: false, code: 'NOT_FOUND', message: '크리에이터 정보를 찾지 못했어요' }, { status: 404 });

	const r = await refreshTossSeller(seller.id);
	if (!r.ok) return json({ ok: false, code: r.code, message: NOT_NOW }, { status: r.code === 'NOT_REGISTERED' ? 409 : 502 });
	return json({ ok: true, toss: tossCardOf(r.info.tossState ?? 'none', r.info, r.info.tossState === info.tossState) });
};
