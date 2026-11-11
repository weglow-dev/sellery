import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { settlementUnit } from '$lib/server/settlement';
import { apiSeller } from '$lib/server/seller';

/**
 * 상품 등록 "예상 정산" — GET ?price=N → { ok, pct, amount }(0092 myr_app_settlement_unit).
 * 정산 회차와 같은 서버 함수(비율 = platform_settings · 버림) — 화면이 정산금을 계산하지 않는다. 크리에이터만.
 */
export const GET: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const raw = event.url.searchParams.get('price') ?? '0';
	if (!/^\d{1,9}$/.test(raw)) return json({ ok: false, code: 'BAD_PRICE' }, { status: 400 });
	const r = await settlementUnit(Number(raw));
	return r ? json({ ok: true, ...r }) : json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
};
