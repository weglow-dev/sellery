import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { brandPath, listCategories, requireBrand } from '$lib/server/brand';
import { PRODUCT_FORM_IMAGE_ACCEPT, PRODUCT_FORM_IMAGE_MAX_BYTES, productFormValues, saveProductAction } from '$lib/server/product-form';

/**
 * `/products/new` — 새 상품 등록 2단계 (docs/brand-console-plan.md §5 `/brand/products/new` · 프로토타입 productModal 등록 분기).
 * load: 카테고리 표(`listCategories`) + 데모 기본값. action save: `saveProductAction(event, null)` → 성공 303 `/products/<code>?msg=created`(pending · 검수 요청) · 실패 fail(400) 값 유지.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/products/new' });
	if (!r.ok) redirect(303, r.location);
	return {
		categories: await listCategories(),
		values: productFormValues(null),
		imageAccept: PRODUCT_FORM_IMAGE_ACCEPT,
		imageMaxMb: Math.round(PRODUCT_FORM_IMAGE_MAX_BYTES / 1024 / 1024),
		listPath: brandPath('/products')
	};
};

export const actions: Actions = {
	save: (event) => saveProductAction(event, null)
};
