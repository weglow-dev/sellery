import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bulkShipTemplateCsv } from '@sellery/db/brand/order-rules';
import { kstToday } from '@sellery/db/dates';
import { requireBrand, unshippedOrderCodes } from '$lib/server/brand';

/**
 * `GET /orders/ship-template.csv` — 운송장 일괄 등록 양식 (프로토타입 actions.ts trackCSVTemplate). 헤더 `주문번호,택배사,운송장번호` + 미발송 주문번호(대문자)를 채워 준다. BOM + CRLF.
 */
export const GET: RequestHandler = async (event) => {
	const r = await requireBrand(event, { next: '/orders' });
	if (!r.ok) redirect(303, r.location);
	const rows = await unshippedOrderCodes(r.ctx.brand.id);
	const name = `운송장양식_${kstToday()}.csv`;
	return new Response(bulkShipTemplateCsv(rows), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="ship-template.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
			'cache-control': 'private, no-store'
		}
	});
};
