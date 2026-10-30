/**
 * 계정 장바구니 · 찜 — 0057 RPC 를 service role 로 부른다 (docs/myr.md §6.2 · 단일 함수 원칙 §3.1).
 * `userId` 는 라우트가 `locals.safeGetSession()` 에서 꺼낸 값만 넘긴다(요청 본문의 id 는 쓰지 않는다 — 규칙 1).
 * 응답 행 → 화면 타입 변환은 순수 모듈 `$lib/cart`(linesFromRows) · `$lib/product-row`(fromRow) — 테스트 src/test/cart.test.ts.
 */
import { linesFromRows, type CartLine, type MergeLine } from '$lib/cart';
import { fromRow, type Row } from '$lib/product-row';
import type { Product } from '$lib/data';
import { admin } from './admin';

/** RPC 가 돌려주는 `{ ok, code, … }` — 실패 code 는 0057 머리말 (NO_USER · NOT_FOUND · NOT_AVAILABLE · BAD_QTY · BAD_OPTION · BAD_LINES) */
export type RpcResult = { ok: boolean; code?: string; qty?: number; liked?: boolean; merged?: number; skipped?: number; removed?: number };

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
	const { data, error } = await admin().rpc(fn, args);
	if (error) throw new Error(`[myr-shop] ${fn} failed: ${error.message}`);
	return data;
}
const asResult = (v: unknown): RpcResult => (v && typeof v === 'object' ? (v as RpcResult) : { ok: false, code: 'BAD_RESPONSE' });
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

export const getCart = async (userId: string): Promise<CartLine[]> => linesFromRows(await rpc('myr_cart_get', { p_user_id: userId }));

export const setCart = async (userId: string, line: { code: string; qty: number; optionIndex?: number; add?: boolean }): Promise<RpcResult> =>
	asResult(
		await rpc('myr_cart_set', { p_user_id: userId, p_code: line.code, p_option_index: line.optionIndex ?? 0, p_qty: line.qty, p_add: line.add ?? false })
	);

export const mergeCart = async (userId: string, lines: MergeLine[]): Promise<RpcResult> =>
	asResult(await rpc('myr_cart_merge', { p_user_id: userId, p_lines: lines }));

export const clearCart = async (userId: string): Promise<RpcResult> => asResult(await rpc('myr_cart_clear', { p_user_id: userId }));

export const getLikes = async (userId: string): Promise<Product[]> => asRows(await rpc('myr_likes_get', { p_user_id: userId })).map(fromRow);

export const setLike = async (userId: string, code: string, liked: boolean): Promise<RpcResult> =>
	asResult(await rpc('myr_like_set', { p_user_id: userId, p_code: code, p_liked: liked }));

export const mergeLikes = async (userId: string, codes: string[]): Promise<RpcResult> =>
	asResult(await rpc('myr_likes_merge', { p_user_id: userId, p_codes: codes }));
