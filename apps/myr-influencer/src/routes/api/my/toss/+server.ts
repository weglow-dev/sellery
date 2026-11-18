import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiSeller } from '$lib/server/seller';
import { getSettleInfoOfUser } from '$lib/server/settle-info';
import { previewTossCardCheck, tossCardOf } from '$lib/server/toss-auth';
import { simApprove, tossSimAllowed } from '$lib/server/toss-sim';
import { isTossCardState } from '$lib/toss-card';

/**
 * 내 정보 "토스 본인인증" [인증을 마쳤어요] — POST { preview?, attempt } → { ok, toss }.
 *   preview(주소 ?toss=) 가 있으면 미리보기 목 · 없으면 이 계정의 실제 상태(가짜 토스가 DB 에 적는다 · lib/server/toss-sim.ts)
 * 토스 연동 전에는 개발 서버 · Vercel Preview 에서만 답한다 — 연동 뒤 확인은 토스 셀러 조회(GET /v2/sellers/{id}) 결과를 같은 함수(myr_app_seller_toss_sync)로 적는다.
 * 크리에이터는 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	if (!tossSimAllowed()) return json({ ok: false, code: 'NOT_READY', message: '토스 본인인증은 아직 준비 중이에요' }, { status: 404 });
	const body = (await event.request.json().catch(() => null)) as { preview?: unknown; attempt?: unknown } | null;
	const { user } = await event.locals.safeGetSession();
	const info = user ? await getSettleInfoOfUser(user.id) : null;
	if (isTossCardState(body?.preview)) return json({ ok: true, toss: previewTossCardCheck(body.preview, Number(body.attempt) || 1, info) });
	if (!info) return json({ ok: false, code: 'NOT_FOUND', message: '크리에이터 정보를 찾지 못했어요' }, { status: 404 });

	// 첫 확인은 "아직", 두 번째부터 인증
	if ((Number(body?.attempt) || 1) < 2) return json({ ok: true, toss: tossCardOf(info.tossState ?? 'none', info, true) });
	const next = (await simApprove(seller.id, info)) ?? info;
	return json({ ok: true, toss: tossCardOf(next.tossState ?? 'none', next) });
};
