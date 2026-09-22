import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandBizDocSignedUrl, requireBrand } from '$lib/server/brand';

/**
 * `GET /settle/doc` — 본인 사업자등록증 보기 (docs/brand-console-plan.md §5 `/brand/settle` — 인플루언서 `/settle/doc` 과 같은 규칙). `requireBrand()` 뒤 `getBrandBizDocSignedUrl(brand.id, 300)` 로
 * Storage `partner-docs` 의 **단기 서명 URL** 을 만들어 302 — 공개 URL 은 만들지 않고, 콘솔 응답에 object path 도 싣지 않는다. 등록된 서류가 없으면 404.
 * 세션을 읽는 응답이라 `cache-control: private, no-store`.
 */
export const GET: RequestHandler = async (event) => {
	const r = await requireBrand(event, { next: '/settle' });
	if (!r.ok) redirect(303, r.location);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const url = await getBrandBizDocSignedUrl(r.ctx.brand.id, 300);
	if (!url) error(404, { message: '등록된 사업자등록증이 없습니다' });
	redirect(302, url);
};
