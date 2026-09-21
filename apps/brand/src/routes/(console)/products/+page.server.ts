import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { commissionToTotalRate, productFailMessage, stockLeftOf } from '@sellery/db/brand/product-rules';
import { RATE_LIMIT_MESSAGE, brandPath, deleteBrandProduct, listBrandProducts, rateLimit, requireBrand, setBrandListing } from '$lib/server/brand';

/**
 * `/products` — 내 상품 목록 2단계 (docs/brand-console-plan.md §5 `/brand/products` · 프로토타입 데모 products/+page.svelte 표: 판매가 · 수수료율 · 샘플 · 재고 · 독점 · 상태 · 판매 일정).
 * 읽기: `listBrandProducts(brand.id)` — 내 것만(삭제 제외 · 최신순) + 배정량 · 잠금 · 진행 캠페인 수 · 확정·진행 일정.
 * action setListing: `?/setListing` code + listed(1|0) → `app_brand_set_listing`(listed ⇄ paused · pending/rejected 는 NOT_REVIEWED) · delete: `?/delete` → `app_brand_delete_product`(진행 이력이 있으면 HAS_ACTIVE_CAMPAIGNS).
 * 둘 다 평범한 POST 뒤 303 `?msg=` 로 돌아온다 — 실패 문구는 productFailMessage 원문(데모 토스트).
 */
export type ProductsMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MESSAGES: Record<string, ProductsMessage> = {
	listed: { tone: 'ok', text: '노출 재개 — 인플루언서 갤러리에 다시 보입니다' },
	paused: { tone: 'info', text: '노출 중단 — 새 샘플 요청만 막히고 진행 중 판매는 유지됩니다' },
	already: { tone: 'info', text: '이미 그 상태예요' },
	deleted: { tone: 'ok', text: '상품을 삭제했어요' },
	created: { tone: 'ok', text: '검수 요청 완료 — 관리자 승인 후 노출' },
	not_found: { tone: 'danger', text: '상품을 찾을 수 없어요' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/products' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const products = await listBrandProducts(brand.id);
	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	const msg: ProductsMessage | null = err ? { tone: 'danger', text: err } : (MESSAGES[key] ?? null);

	return {
		msg,
		products: products.map((p) => ({
			code: p.code,
			name: p.name,
			description: p.description,
			emoji: p.emoji,
			thumb_url: p.thumb_url,
			consumer_price: p.consumer_price,
			sale_price: p.sale_price,
			total_rate: commissionToTotalRate(p.commission_rate),
			commission_rate: p.commission_rate,
			sample_text: p.sample_text,
			sample_free_grade: p.sample_free_grade,
			sample_buy_mode: p.sample_buy_mode,
			sample_fixed_price: p.sample_fixed_price,
			sample_refund: p.sample_refund,
			stock: p.stock,
			allocated: p.allocated,
			left: stockLeftOf(p.stock, p.allocated),
			locked: p.locked,
			active_campaigns: p.active_campaigns,
			status: p.status,
			chip: p.chip,
			reject_reason: p.reject_reason,
			exclusive_grade: p.exclusive_grade,
			exclusive_seller_id: p.exclusive_seller_id,
			boosted: p.boosted_at !== null,
			schedules: p.schedules,
			href: p.code ? brandPath(`/products/${encodeURIComponent(p.code)}`) : null
		})),
		newPath: brandPath('/products/new'),
		campaignsPath: brandPath('/campaigns')
	};
};

const self = brandPath('/products');

export const actions: Actions = {
	setListing: async (event) => {
		const r = await requireBrand(event, { next: '/products' });
		if (!r.ok) redirect(303, r.location);
		const fd = await event.request.formData();
		const code = String(fd.get('code') ?? '');
		const listed = fd.get('listed') === '1';
		if (!rateLimit(`product-listing:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const res = await setBrandListing(r.ctx.brand.id, code, listed);
		if (!res.ok) redirect(303, `${self}?err=${encodeURIComponent(productFailMessage(res))}`);
		redirect(303, `${self}?msg=${res.already ? 'already' : listed ? 'listed' : 'paused'}`);
	},
	delete: async (event) => {
		const r = await requireBrand(event, { next: '/products' });
		if (!r.ok) redirect(303, r.location);
		const fd = await event.request.formData();
		const code = String(fd.get('code') ?? '');
		if (!rateLimit(`product-delete:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const res = await deleteBrandProduct(r.ctx.brand.id, code);
		if (!res.ok) redirect(303, `${self}?err=${encodeURIComponent(productFailMessage(res))}`);
		redirect(303, `${self}?msg=deleted`);
	}
};
