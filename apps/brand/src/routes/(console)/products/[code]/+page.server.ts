import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { brandPath, getBrandProduct, listCategories, requireBrand } from '$lib/server/brand';
import { PRODUCT_FORM_IMAGE_ACCEPT, PRODUCT_FORM_IMAGE_MAX_BYTES, productFormValues, saveProductAction } from '$lib/server/product-form';

/**
 * `/products/[code]` — 상품 수정 2단계 (docs/brand-console-plan.md §5 `/brand/products/[code]` · 프로토타입 productModal 수정 분기 · saveProduct 잠금/재검수).
 * load: `getBrandProduct(brand.id, code)` — **내 것이 아니면 null → 404**(§6 2단계 (g)). 잠금(`locked`) · 배정량(`allocated`) · 독점 확정 여부를 폼에 넘긴다.
 * 3단계(0016): 노출 중 상품이면 [인플루언서 초대] → `/products/[code]/invite` (inviteHref).
 * action save: `saveProductAction(event, code)` → 성공 303 `?msg=saved|rereview|pending_saved` · 실패 fail(400)(LOCKED_FIELD · STOCK_BELOW_ALLOCATED · INVALID_INPUT{field} 문구).
 */
const MESSAGES: Record<string, (name: string) => { tone: 'ok' | 'info'; text: string }> = {
	created: () => ({ tone: 'ok', text: '검수 요청 완료 — 관리자 승인 후 노출' }),
	saved: (n) => ({ tone: 'ok', text: `${n} 수정 저장 완료` }),
	rereview: (n) => ({ tone: 'info', text: `${n} 수정 저장 — 판매가·수수료율 변경으로 재검수 대기로 전환됩니다` }),
	pending_saved: (n) => ({ tone: 'ok', text: `${n} 수정 저장 — 재검수 요청됨` })
};

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireBrand(event, { next: `/products/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);

	const product = await getBrandProduct(r.ctx.brand.id, code);
	if (!product) error(404, { message: '상품을 찾을 수 없습니다' });
	const key = event.url.searchParams.get('msg') ?? '';
	return {
		product: {
			code: product.code ?? code,
			name: product.name,
			emoji: product.emoji,
			thumb_url: product.thumb_url,
			image_urls: product.image_urls,
			status: product.status,
			chip: product.chip,
			reject_reason: product.reject_reason,
			locked: product.locked,
			allocated: product.allocated,
			active_campaigns: product.active_campaigns,
			exclusive_seller_locked: product.exclusive_seller_id !== null,
			schedules: product.schedules
		},
		categories: await listCategories(),
		values: productFormValues(product),
		msg: MESSAGES[key]?.(product.name) ?? null,
		imageAccept: PRODUCT_FORM_IMAGE_ACCEPT,
		imageMaxMb: Math.round(PRODUCT_FORM_IMAGE_MAX_BYTES / 1024 / 1024),
		listPath: brandPath('/products'),
		inviteHref: brandPath(`/products/${encodeURIComponent(product.code ?? code)}/invite`)
	};
};

export const actions: Actions = {
	save: (event) => saveProductAction(event, event.params.code)
};
