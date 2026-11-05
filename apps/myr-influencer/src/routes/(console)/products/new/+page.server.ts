import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/seller';
import { getSellerProduct } from '$lib/server/seller-products';

/**
 * 상품 등록 에디터 — `?id=<상품>` 이면 내 상품을 불러온다(0073).
 *   임시저장 · 반려 → mode 'new'(이어 쓰기 · 다시 심사 요청)
 *   판매 중 · 일시중지 → mode 'edit'(수정 심사 · 4-2) — 수정본 저장은 다음 단계라 revisionPreview(dev · Vercel Preview)에서만 완료 화면까지
 *   그 밖의 상태(심사 중 · 종료) · 남의 상품 → 내 제품으로
 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const revisionPreview = dev || env.VERCEL_ENV === 'preview';
	const id = event.url.searchParams.get('id');
	if (!id) return { product: null, mode: 'new' as const, revisionPreview };
	const product = /^[0-9a-f-]{36}$/.test(id) ? await getSellerProduct(seller.id, id) : null;
	if (!product) redirect(303, '/products');
	if (product.status === 'draft' || product.status === 'rejected') return { product, mode: 'new' as const, revisionPreview };
	if (product.status === 'listed' || product.status === 'paused') return { product, mode: 'edit' as const, revisionPreview };
	redirect(303, '/products');
};
