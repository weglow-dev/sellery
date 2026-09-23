import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getAdminProduct, getProductPreviewCard } from '$lib/server/partners';

/**
 * `/products/[code]/preview` — 검수용 **상세페이지 미리보기** (데모 [상세페이지] 버튼 `go.store('p:' + id)` 의 실서비스 판).
 * 판매 링크가 발급되기 전(검수 대기 · 반려 · 노출 중단)에도 고객에게 어떻게 보이는지 확인해야 검수를 할 수 있다.
 * 본문은 고객 판매 페이지와 **같은 컴포넌트**(`@sellery/ui/site` `StoreView`)를 `preview` 모드로 렌더한다 —
 * 구매 CTA 는 "판매 링크 발급 전" 안내로 바뀐다(합성 캠페인으로 체크아웃에 들어가지 못하게).
 *
 * 관리자 전용이다 — 검수 전 상품이 공개 URL 로 노출되지 않도록 shop 에 미리보기 라우트를 만들지 않았다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const [card, product] = await Promise.all([getProductPreviewCard(event.params.code), getAdminProduct(event.params.code)]);
	if (!card || !product) error(404, { message: '상품을 찾을 수 없습니다' });

	return {
		card,
		product,
		backPath: `${adminPath('/products')}/${encodeURIComponent(event.params.code)}`,
		listPath: adminPath('/products')
	};
};
