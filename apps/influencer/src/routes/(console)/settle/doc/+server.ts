import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBizDocSignedUrl, requireSeller } from '$lib/server/partner';

/**
 * `GET /settle/doc` — 본인 사업자등록증 보기 (docs/inf-console-plan.md §5.9). `requireSeller()` 뒤 `getBizDocSignedUrl(seller.id, 300)` 로
 * Storage `partner-docs` 의 **단기 서명 URL** 을 만들어 302 — 공개 URL 은 만들지 않고, 콘솔 응답에 object path 도 싣지 않는다. 등록된 서류가 없으면 404.
 * 세션을 읽는 응답이라 `cache-control: private, no-store`(§2.3).
 */
export const GET: RequestHandler = async (event) => {
	const r = await requireSeller(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const url = await getBizDocSignedUrl(r.ctx.seller.id, 300);
	if (!url) error(404, { message: '등록된 사업자등록증이 없습니다' });
	redirect(302, url);
};
