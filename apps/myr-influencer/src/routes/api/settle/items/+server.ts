import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSettlementMonth } from '@sellery/myr-core/settlement-rules';
import { apiSeller } from '$lib/server/seller';
import { listSellerSettlementItemsOfUser } from '$lib/server/settlement';

/**
 * 정산 월 내역 펼쳐 보기(0089) — GET ?month=YYYY-MM → { ok, items }(주문 줄 · 고객 이름 가림 · 정산 뒤 환불 구분).
 * 크리에이터는 세션 계정에서만(결정 3) — 다른 크리에이터의 줄은 RPC 가 내지 않는다.
 */
export const GET: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const month = parseSettlementMonth(event.url.searchParams.get('month'));
	if (!month) return json({ ok: false, code: 'BAD_MONTH' }, { status: 400 });
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	try {
		return json({ ok: true, items: await listSellerSettlementItemsOfUser(user.id, month) });
	} catch (e) {
		console.error('[api/settle/items]', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	}
};
