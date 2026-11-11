import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { groupbuyErrorMessage } from '@sellery/myr-core/groupbuy';
import { previewGroupbuy } from '$lib/server/groupbuy';
import { apiSeller } from '$lib/server/seller';

/**
 * 공구 할인율 미리보기(0092) — GET ?pct=N → { ok, basePrice, price } · { ok:false, code: NOT_FOUND | BAD_PCT, message }.
 * 할인율 범위는 만들기와 같은 서버 함수(0099 myr_groupbuy_pct_ok) — 범위 밖이면 BAD_PCT 와 범위를 넣은 문구.
 * 실제 공구 생성과 같은 서버 함수(옵션 0번 단가 · myr_groupbuy_price) — 화면이 공구가를 계산하지 않는다. 내 상품만.
 */
export const GET: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	if (!/^[0-9a-f-]{36}$/.test(event.params.id)) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const raw = event.url.searchParams.get('pct') ?? '';
	if (!/^\d{1,2}$/.test(raw)) return json({ ok: false, code: 'BAD_PCT' }, { status: 400 });
	const r = await previewGroupbuy(seller.id, event.params.id, Number(raw));
	if (r.ok) return json(r);
	return json({ ...r, message: groupbuyErrorMessage(r.code, r.range) }, { status: r.code === 'NOT_FOUND' ? 404 : r.code === 'DB_ERROR' ? 500 : 400 });
};
