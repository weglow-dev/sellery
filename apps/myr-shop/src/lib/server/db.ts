/**
 * 샵 데이터 — Supabase 공개 RPC(0056) 를 anon 키로 읽어 `Product` 로 바꾼다 (docs/myr.md §3 · §7 S2).
 *   listProducts()         `myr_home_products()` — 홈 · 카테고리
 *   getProductCard(code)   `myr_product_card(code)` — 상품 페이지 + 함께 보면 좋은 레시피
 * `PUBLIC_SUPABASE_*` 가 비면(키 없는 로컬 · CI 더미) **목 데이터**로 돌아간다 — 응답의 `source` 로 화면이 알 수 있다.
 * dev 서버는 RPC 가 실패해도(0056 미적용 등) 목 데이터로 떨어진다. 프로덕션은 빈 목록/404 + 에러 로그.
 * 세션·쿠키는 아직 없다(S3). 서버 전용(`$lib/server`) — 브라우저 번들에 anon 키가 실리지 않게.
 */
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MOCK_PRODUCTS, relatedOf, type Product } from '$lib/data';
import { fromRow, type Row } from '$lib/product-row';

export type Source = 'db' | 'mock';
export { fromRow };

let client: SupabaseClient | null | undefined;
function supabase(): SupabaseClient | null {
	if (client !== undefined) return client;
	client =
		PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY
			? createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
			: null;
	if (!client) console.warn('[myr-shop] PUBLIC_SUPABASE_URL/ANON_KEY 가 비어 있어 목 데이터로 렌더합니다');
	return client;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function listProducts(): Promise<{ products: Product[]; source: Source }> {
	const sb = supabase();
	if (!sb) return { products: MOCK_PRODUCTS, source: 'mock' };
	const { data, error } = await sb.rpc('myr_home_products');
	if (error) {
		console.error('[myr-shop] myr_home_products failed:', error.message, dev ? '— dev 라 목 데이터로' : '');
		if (dev) return { products: MOCK_PRODUCTS, source: 'mock' };
		return { products: [], source: 'db' };
	}
	return { products: arr<Row>(data).map(fromRow), source: 'db' };
}

export async function getProductCard(code: string): Promise<{ product: Product; related: Product[]; source: Source } | null> {
	const sb = supabase();
	if (!sb) {
		const p = MOCK_PRODUCTS.find((x) => x.code === code);
		return p ? { product: p, related: relatedOf(p, MOCK_PRODUCTS), source: 'mock' } : null;
	}
	const { data, error } = await sb.rpc('myr_product_card', { p_code: code });
	if (error) {
		console.error('[myr-shop] myr_product_card failed:', error.message, dev ? '— dev 라 목 데이터로' : '');
		if (dev) {
			const p = MOCK_PRODUCTS.find((x) => x.code === code);
			return p ? { product: p, related: relatedOf(p, MOCK_PRODUCTS), source: 'mock' } : null;
		}
		return null;
	}
	if (!data || typeof data !== 'object') return null;
	const row = data as Row;
	return { product: fromRow(row), related: arr<Row>(row.related).map(fromRow), source: 'db' };
}
