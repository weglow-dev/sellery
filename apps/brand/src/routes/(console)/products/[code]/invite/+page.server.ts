import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { inviteFailMessage, parseInviteInput } from '@sellery/db/brand/invite-rules';
import { productStatusChip } from '@sellery/db/brand/product-rules';
import { RATE_LIMIT_MESSAGE, brandPath, getBrandProduct, inviteSeller, listInviteCandidates, rateLimit, requireBrand } from '$lib/server/brand';

/**
 * `/products/[code]/invite` — 인플루언서 직접 제안(초대) 3단계 (docs/brand-console-plan.md §6 행 3 PR-B(brand) "초대 폼(상품 · 인플루언서 검색 — app_brand_invite_candidates)" · 프로토타입 inviteModal + 갤러리 sellerCard 의 3단계 부분집합).
 * load: `getBrandProduct(brand.id, code)` — 내 것이 아니면 404 · 노출 중(listed)이 아니면 후보 없이 안내만. `listInviteCandidates` — 공개 · 플래티넘 이하(다이아·블랙은 6단계 🥬 제안권, 0017) · 인증 채널 · 같은 상품 진행 중 아님 · 팔로워순 ≤ 50.
 * action invite: `parseInviteInput`(seller_id · product_id · message ≤ 500) → `inviteSeller` → 새 캠페인 INVITED → 303 `/campaigns/<code>?msg=invited`.
 *   실패는 fail(400) 로 선택·메시지 유지 — ALREADY_ACTIVE 는 진행 중 캠페인 링크를 함께.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireBrand(event, { next: `/products/${encodeURIComponent(code)}/invite` });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const product = await getBrandProduct(brand.id, code);
	if (!product) error(404, { message: '상품을 찾을 수 없습니다' });
	const listed = product.status === 'listed';
	const found = listed ? await listInviteCandidates(brand.id, code) : null;

	return {
		brand: { name: brand.name },
		product: {
			id: product.id,
			code: product.code ?? code,
			name: product.name,
			emoji: product.emoji,
			thumb_url: product.thumb_url,
			category: product.category,
			status: product.status,
			chip: productStatusChip(product.status),
			sale_price: product.sale_price,
			commission_rate: product.commission_rate,
			listed,
			exclusive_seller_id: product.exclusive_seller_id
		},
		candidates: found?.candidates ?? [],
		defaultMessage: `안녕하세요, ${brand.name}입니다. 채널 결이 저희 ${product.name}와 잘 맞아 판매를 제안드려요. 샘플부터 보내드릴게요!`,
		productHref: brandPath(`/products/${encodeURIComponent(code)}`),
		productsPath: brandPath('/products'),
		campaignsPath: brandPath('/campaigns')
	};
};

export const actions: Actions = {
	invite: async (event) => {
		const code = event.params.code;
		const r = await requireBrand(event, { next: `/products/${encodeURIComponent(code)}/invite` });
		if (!r.ok) redirect(303, r.location);
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const bad = (message: string, field: string | null = null, campaignHref: string | null = null) => fail(400, { message, field, values, campaignHref });

		if (!rateLimit(`invite:${r.ctx.user.id}`)) return bad(RATE_LIMIT_MESSAGE);
		const parsed = parseInviteInput(fd);
		if (!parsed.ok) return bad(parsed.message, parsed.field);
		const res = await inviteSeller(r.ctx.brand.id, r.ctx.user.id, parsed);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '상품을 찾을 수 없습니다' });
			const href = res.code === 'ALREADY_ACTIVE' && res.campaignCode ? brandPath(`/campaigns/${encodeURIComponent(res.campaignCode)}`) : null;
			return bad(inviteFailMessage(res), res.code === 'BAD_MESSAGE' ? 'message' : res.code === 'SELLER_NOT_FOUND' ? 'seller_id' : null, href);
		}
		redirect(303, `${brandPath(`/campaigns/${encodeURIComponent(res.campaignCode)}`)}?msg=invited`);
	}
};
