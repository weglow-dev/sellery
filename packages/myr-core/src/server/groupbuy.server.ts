/**
 * 공구 링크(서버 전용 · 0086). 크리에이터 함수의 seller id 는 호출자가 서버 세션에서 정해 넘긴다(결정 3).
 * 샵의 링크 조회(lookupGroupbuy)는 코드만 받는다 — 링크 자체가 공개 값이다.
 */
import { groupbuyFromJson, sellerGroupbuyFromJson, type Groupbuy, type GroupbuyBody, type SellerGroupbuy } from '../groupbuy';
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

export type SellerGroupbuyProduct = { id: string; code: string; name: string; price: number; status: string; tile: string | null; icon: string; thumbUrl: string | null };

/** 상품의 공구 목록(최근 순 · 실적 포함) · 남의 상품이면 null */
export async function sellerGroupbuys(sellerId: string, productId: string): Promise<{ product: SellerGroupbuyProduct; items: SellerGroupbuy[] } | null> {
	const { data, error } = await admin().rpc('myr_app_seller_groupbuys', { p_seller: sellerId, p_product_id: productId });
	if (error) throw new Error(`myr_app_seller_groupbuys failed: ${error.message}`);
	const o = data as { product?: Record<string, unknown>; items?: unknown } | null;
	const p = o?.product;
	if (!p || typeof p.id !== 'string') return null;
	return {
		product: {
			id: p.id,
			code: String(p.code ?? ''),
			name: String(p.name ?? ''),
			price: Number(p.price ?? 0),
			status: String(p.status ?? ''),
			tile: typeof p.tile === 'string' ? p.tile : null,
			icon: typeof p.icon === 'string' ? p.icon : 'pill',
			thumbUrl: typeof p.thumb_url === 'string' ? p.thumb_url : null
		},
		items: (Array.isArray(o?.items) ? o.items : []).map(sellerGroupbuyFromJson).filter((g): g is SellerGroupbuy => !!g)
	};
}

export type GroupbuyResult = { ok: true; groupbuy: SellerGroupbuy } | { ok: false; code: string };
const asResult = (data: unknown): GroupbuyResult => {
	const r = data as { ok?: boolean; code?: string; groupbuy?: unknown } | null;
	const g = sellerGroupbuyFromJson(r?.groupbuy);
	return r?.ok && g ? { ok: true, groupbuy: g } : { ok: false, code: typeof r?.code === 'string' ? r.code : 'DB_ERROR' };
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
