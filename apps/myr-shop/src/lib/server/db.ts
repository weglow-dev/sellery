/**
 * 샵 데이터 — Supabase 공개 RPC(0056) 를 anon 키로 읽어 `Product` 로 바꾼다 (docs/myr.md §3 · §7 S2).
 *   listProducts()         `myr_home_products()` — 홈 · 카테고리
 *   getProductCard(code)   `myr_product_card(code)` — 상품 페이지 + 함께 보면 좋은 레시피
 * 폴백 규칙(`lib/fallback.ts` · 2026-10-30): **목 데이터는 로컬 dev 서버에서만** — 환경변수가 비어 있거나(키 없는 로컬) RPC 가 실패하면(0056 미적용 등) 목으로.
 * 운영·Preview 는 어느 경우든 **빈 목록 / 404 + 에러 로그** — 가짜 상품이 운영에 뜨지 않게. 응답의 `source` 로 화면이 어느 쪽인지 안다.
 * 서버 전용(`$lib/server`) — 브라우저 번들에 anon 키가 실리지 않게.
 */
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MOCK_PRODUCTS, relatedOf, type Product } from '$lib/data';
import { fallbackLog, useMock, type FallbackReason } from '$lib/fallback';
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
	return client;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 폴백 한 번 — 로그를 남기고 dev 면 true(목으로), 아니면 false(빈 화면) */
function fallback(reason: FallbackReason, detail?: string): boolean {
	const { level, message } = fallbackLog(dev, reason, detail);
	console[level](message);
	return useMock(dev, reason);
}

export async function listProducts(): Promise<{ products: Product[]; source: Source }> {
	const sb = supabase();
	if (!sb) return fallback('no-env') ? { products: MOCK_PRODUCTS, source: 'mock' } : { products: [], source: 'db' };
	const { data, error } = await sb.rpc('myr_home_products');
	if (error) return fallback('rpc-error', `myr_home_products ${error.message}`) ? { products: MOCK_PRODUCTS, source: 'mock' } : { products: [], source: 'db' };
	return { products: arr<Row>(data).map(fromRow), source: 'db' };
}

const mockCard = (code: string) => {
	const p = MOCK_PRODUCTS.find((x) => x.code === code);
	return p ? { product: p, related: relatedOf(p, MOCK_PRODUCTS), source: 'mock' as const } : null;
};

export async function getProductCard(code: string): Promise<{ product: Product; related: Product[]; source: Source } | null> {
	const sb = supabase();
	if (!sb) return fallback('no-env') ? mockCard(code) : null;
	const { data, error } = await sb.rpc('myr_product_card', { p_code: code });
	if (error) return fallback('rpc-error', `myr_product_card ${error.message}`) ? mockCard(code) : null;
	if (!data || typeof data !== 'object') return null;
	const row = data as Row;
	return { product: fromRow(row), related: arr<Row>(row.related).map(fromRow), source: 'db' };
}
