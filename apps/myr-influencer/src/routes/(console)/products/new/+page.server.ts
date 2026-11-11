import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/seller';
import { getSellerProduct } from '$lib/server/seller-products';

/**
 * 상품 등록 에디터 — `?id=<상품>` 이면 내 상품을 불러온다(0073 · 0074). `?step=1~8` 은 고치기 · 수정 모드의 첫 단계(기본 8).
 *   임시저장 → mode 'new'(이어 쓰기)
 *   반려 → mode 'fix' · kind 'new'(반려 내용 고치기 → 다시 심사 요청 · 운영팀 의견은 product.rejectItems)
 *   판매 중 · 일시중지 → 수정본이 반려됐으면 mode 'fix' · kind 'rev'(반려된 수정본 내용에서 이어서) · 없으면 mode 'edit'(수정 심사) · 심사 중이면 내 제품으로
 *   그 밖의 상태(심사 중 · 종료) · 남의 상품 → 내 제품으로
 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const id = event.url.searchParams.get('id');
	const stepParam = Number(event.url.searchParams.get('step'));
	const step = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= 8 ? stepParam : null;
	if (!id) return { product: null, revision: null, mode: 'new' as const, fixKind: null, step: null };
	const found = /^[0-9a-f-]{36}$/.test(id) ? await getSellerProduct(seller.id, id) : null;
	if (!found) redirect(303, '/products');
	const { product, revision } = found;
	if (product.status === 'draft') return { product, revision: null, mode: 'new' as const, fixKind: null, step: null };
	if (product.status === 'rejected') return { product, revision: null, mode: 'fix' as const, fixKind: 'new' as const, step };
	// 수정 심사로 고치는 상품(판매 중 · 일시중지) — 서버 값 approved(0099 · 수정본 접수 myr_app_seller_submit_revision 와 같은 판정)
	if (product.approved) {
		if (revision?.status === 'rejected') return { product, revision, mode: 'fix' as const, fixKind: 'rev' as const, step };
		if (!revision) return { product, revision: null, mode: 'edit' as const, fixKind: null, step };
	}
	redirect(303, '/products');
};
