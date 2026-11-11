/**
 * 공구 링크(서버 전용 · 0086). 크리에이터 함수의 seller id 는 호출자가 서버 세션에서 정해 넘긴다(결정 3).
 * 샵의 링크 조회(lookupGroupbuy)는 코드만 받는다 — 링크 자체가 공개 값이다.
 */
import { groupbuyFromJson, pctRangeFromJson, sellerGroupbuyFromJson, type Groupbuy, type GroupbuyBody, type GroupbuyPctRange, type SellerGroupbuy } from '../groupbuy';
import { admin } from './admin.server';

export type { Groupbuy, SellerGroupbuy } from '../groupbuy';

/** 링크 코드 → 상품 code + 공구 · 없거나 상품이 샵에 없으면 null */
export async function lookupGroupbuy(code: string): Promise<{ productCode: string; groupbuy: Groupbuy } | null> {
	const { data, error } = await admin().rpc('myr_groupbuy_lookup', { p_code: code });
	if (error) throw new Error(`myr_groupbuy_lookup failed: ${error.message}`);
	const o = data as { product_code?: unknown; groupbuy?: unknown } | null;
	const g = groupbuyFromJson(o?.groupbuy);
	return g && typeof o?.product_code === 'string' ? { productCode: o.product_code, groupbuy: g } : null;
}

/** listed = 공구를 만들 수 있는 판매 중 상품인가 · soldOut = 품절 — 서버 값 그대로(0099 myr_product_listed · myr_product_sold_out · 만들기 RPC 와 같은 함수) */
export type SellerGroupbuyProduct = { id: string; code: string; name: string; price: number; status: string; listed: boolean; soldOut: boolean; tile: string | null; icon: string; thumbUrl: string | null };

/** 상품의 공구 목록(최근 순 · 실적 포함) · 할인율 범위(서버 값 · 못 받았으면 null) · 남의 상품이면 null */
export async function sellerGroupbuys(sellerId: string, productId: string): Promise<{ product: SellerGroupbuyProduct; pctRange: GroupbuyPctRange | null; items: SellerGroupbuy[] } | null> {
	const { data, error } = await admin().rpc('myr_app_seller_groupbuys', { p_seller: sellerId, p_product_id: productId });
	if (error) throw new Error(`myr_app_seller_groupbuys failed: ${error.message}`);
	const o = data as { product?: Record<string, unknown>; items?: unknown; pct_min?: unknown; pct_max?: unknown } | null;
	const p = o?.product;
	if (!p || typeof p.id !== 'string') return null;
	return {
		product: {
			id: p.id,
			code: String(p.code ?? ''),
			name: String(p.name ?? ''),
			price: Number(p.price ?? 0),
			status: String(p.status ?? ''),
			listed: p.listed === true,
			soldOut: p.sold_out === true,
			tile: typeof p.tile === 'string' ? p.tile : null,
			icon: typeof p.icon === 'string' ? p.icon : 'pill',
			thumbUrl: typeof p.thumb_url === 'string' ? p.thumb_url : null
		},
		pctRange: pctRangeFromJson(o?.pct_min, o?.pct_max),
		items: (Array.isArray(o?.items) ? o.items : []).map(sellerGroupbuyFromJson).filter((g): g is SellerGroupbuy => !!g)
	};
}

/** range = BAD_PCT 거절에 서버가 같이 준 할인율 범위(0099) — 안내 문구가 이 값을 쓴다 */
export type GroupbuyResult = { ok: true; groupbuy: SellerGroupbuy } | { ok: false; code: string; range?: GroupbuyPctRange };
const rejected = (r: { code?: string; min?: unknown; max?: unknown } | null): { ok: false; code: string; range?: GroupbuyPctRange } => {
	const range = pctRangeFromJson(r?.min, r?.max);
	return { ok: false, code: typeof r?.code === 'string' ? r.code : 'DB_ERROR', ...(range ? { range } : {}) };
};
const asResult = (data: unknown): GroupbuyResult => {
	const r = data as { ok?: boolean; code?: string; groupbuy?: unknown; min?: unknown; max?: unknown } | null;
	const g = sellerGroupbuyFromJson(r?.groupbuy);
	return r?.ok && g ? { ok: true, groupbuy: g } : rejected(r);
};

export async function createGroupbuy(sellerId: string, productId: string, b: GroupbuyBody): Promise<GroupbuyResult> {
	const { data, error } = await admin().rpc('myr_app_seller_groupbuy_create', {
		p_seller: sellerId,
		p_product_id: productId,
		p_pct: b.pct,
		p_starts_at: b.startsAt,
		p_ends_at: b.endsAt
	});
	if (error) {
		console.error('[groupbuy] create failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	return asResult(data);
}

export async function closeGroupbuy(sellerId: string, code: string): Promise<GroupbuyResult> {
	const { data, error } = await admin().rpc('myr_app_seller_groupbuy_close', { p_seller: sellerId, p_code: code });
	if (error) {
		console.error('[groupbuy] close failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	return asResult(data);
}

/** 할인율 미리보기(0092 myr_app_groupbuy_preview) — 실제 공구와 같은 단가(옵션 0번) · 같은 공구가 식 · 같은 할인율 범위(0099 — 범위 밖이면 BAD_PCT + range). 내 상품만(seller 는 게이트가 세션에서) */
export type GroupbuyPreview = { ok: true; basePrice: number; price: number } | { ok: false; code: string; range?: GroupbuyPctRange };
export async function previewGroupbuy(sellerId: string, productId: string, pct: number): Promise<GroupbuyPreview> {
	const { data, error } = await admin().rpc('myr_app_groupbuy_preview', { p_seller: sellerId, p_product_id: productId, p_pct: pct });
	if (error) {
		console.error('[groupbuy] preview failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = data as { ok?: boolean; code?: string; price?: unknown; base_price?: unknown; min?: unknown; max?: unknown } | null;
	return r?.ok === true && typeof r.price === 'number' && typeof r.base_price === 'number' ? { ok: true, basePrice: r.base_price, price: r.price } : rejected(r);
}
