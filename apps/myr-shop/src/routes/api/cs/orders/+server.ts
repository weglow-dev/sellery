import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { csOrderOptions, PRODUCT_CODE_RE } from '@sellery/myr-core/cs-rules';
import { shortDate } from '@sellery/myr-core/order-view';
import { hasAdmin } from '$lib/server/admin';
import { myOrders } from '$lib/server/orders';

/** GET /api/cs/orders?product=<code> — 문의 시트의 주문 드롭다운. 로그인 회원의 최근 주문 50건 중 이 상품 줄이 있는 것만. 비로그인 = 빈 목록. 캐시 금지. */
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const product = (url.searchParams.get('product') ?? '').trim().toLowerCase();
	if (!PRODUCT_CODE_RE.test(product) || !hasAdmin()) return json({ ok: true, orders: [] });
	const { user } = await locals.safeGetSession();
	if (!user) return json({ ok: true, orders: [] });
	try {
		return json({ ok: true, orders: csOrderOptions(await myOrders(user.id, 50), product, shortDate) });
	} catch (e) {
		console.error('[api/cs/orders] failed:', e instanceof Error ? e.message : e);
		return json({ ok: true, orders: [] });
	}
};
