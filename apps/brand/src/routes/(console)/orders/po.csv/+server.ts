import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { poCsv, poFileName } from '@sellery/db/brand/order-rules';
import { kstToday } from '@sellery/db/dates';
import { poRows, requireBrand } from '$lib/server/brand';

/**
 * `GET /orders/po.csv?campaign=<code>` — 발주서 CSV 다운로드 (docs/brand-console-plan.md §5 `/brand/orders` `GET /brand/orders/po.csv` · 프로토타입 actions.ts poCSV + dlCSV).
 * `poRows(brand.id, campaign)` — PAID 비샘플 주문 + 수취인 원문(발송 목적 · §8) · 첫 내보내기에 `campaigns.po_exported_at` + 이벤트 `po_sent` 1회. 남의 캠페인 코드 → 404.
 * BOM + CRLF + 17열(`PO_COLUMNS`) — 엑셀에서 한글 정상(§6 행 4 (d)). 파일명 `발주서_{상호}_{YYYY-MM-DD}.csv` 는 RFC 5987 로.
 */
export const GET: RequestHandler = async (event) => {
	const r = await requireBrand(event, { next: '/orders' });
	if (!r.ok) redirect(303, r.location);
	const campaign = (event.url.searchParams.get('campaign') ?? '').trim() || null;
	const po = await poRows(r.ctx.brand.id, campaign);
	if (!po) error(404, { message: '캠페인을 찾을 수 없습니다' });
	const name = poFileName(r.ctx.brand.name, kstToday());
	return new Response(poCsv(po.rows), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="po.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
			'cache-control': 'private, no-store'
		}
	});
};
