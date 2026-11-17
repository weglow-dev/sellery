/**
 * 계정 장바구니 · 찜 — 0057 RPC 를 service role 로 부른다 (docs/myr.md §6.2 · 단일 함수 원칙 §3.1).
 * `userId` 는 라우트가 `locals.safeGetSession()` 에서 꺼낸 값만 넘긴다(요청 본문의 id 는 쓰지 않는다 — 규칙 1).
 * 응답 행 → 화면 타입 변환은 순수 모듈 `$lib/cart`(linesFromRows) · `$lib/product-row`(fromRow) — 테스트 src/test/cart.test.ts.
 */
import { linesFromRows, parseCartQuote, type CartLine, type CartQuote, type MergeLine, type QuoteRequestLine } from '$lib/cart';
import { fromRow, type Row } from '$lib/product-row';
import type { Product } from '$lib/data';
import type { Cookies } from '@sveltejs/kit';
import { GUEST_CHECKOUT_COOKIE } from '@sellery/myr-core/checkout-rules';
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

/** gb = 공구 링크 코드(0086) — 끝났거나 다른 상품의 코드면 RPC 가 버린다(기본가로 담긴다) · 없으면 줄의 기존 공구를 그대로 둔다 */
export const setCart = async (userId: string, line: { code: string; qty: number; optionIndex?: number; add?: boolean; gb?: string }): Promise<RpcResult> =>
	asResult(
		await rpc('myr_cart_set', {
			p_user_id: userId,
			p_code: line.code,
			p_option_index: line.optionIndex ?? 0,
			p_qty: line.qty,
			p_add: line.add ?? false,
			p_groupbuy: line.gb ?? null
		})
	);

export const mergeCart = async (userId: string, lines: MergeLine[]): Promise<RpcResult> =>
	asResult(await rpc('myr_cart_merge', { p_user_id: userId, p_lines: lines }));

export const clearCart = async (userId: string): Promise<RpcResult> => asResult(await rpc('myr_cart_clear', { p_user_id: userId }));

/** 주문된 상품만 장바구니에서 뺀다(선택 주문 — 선택 안 한 줄은 남긴다). 줄마다 qty 0 = 삭제. 하나가 실패해도 나머지는 계속 */
export async function removeCartCodes(userId: string, codes: string[]): Promise<void> {
	await Promise.allSettled(codes.map((code) => setCart(userId, { code, qty: 0 })));
}

export const getLikes = async (userId: string): Promise<Product[]> => asRows(await rpc('myr_likes_get', { p_user_id: userId })).map(fromRow);

export const setLike = async (userId: string, code: string, liked: boolean): Promise<RpcResult> =>
	asResult(await rpc('myr_like_set', { p_user_id: userId, p_code: code, p_liked: liked }));

export const mergeLikes = async (userId: string, codes: string[]): Promise<RpcResult> =>
	asResult(await rpc('myr_likes_merge', { p_user_id: userId, p_codes: codes }));

/** 장바구니 · 체크아웃 요약 견적(0092 myr_app_cart_quote) — 체크아웃과 같은 단가 · 공구 · 배송비 함수. 돈은 움직이지 않는다.
 *  서버가 거절하면(수량 형식 등 — 0097 myr_qty_parse) 그 code 를 그대로 · 응답 모양이 틀리면 BAD_RESPONSE */
export type QuoteResult = { ok: true; quote: CartQuote } | { ok: false; code: string };
/** 누구의 견적인지 — 남은 수량에서 내 대기 결제 몫을 돌려받는다(0115 · 결제 생성 /api/checkout 과 같은 인자).
 *  회원은 세션 사용자 · 비회원은 이전 결제 쿠키. 라우트가 세션에서 정한다(요청 본문은 쓰지 않는다 — 규칙 6) */
export type QuoteActor = { userId: string | null; prevCheckoutId: string | null };
export async function quoteActor(locals: App.Locals, cookies: Cookies): Promise<QuoteActor> {
	const { user } = await locals.safeGetSession();
	const prev = user ? null : (cookies.get(GUEST_CHECKOUT_COOKIE) ?? null);
	return { userId: user?.id ?? null, prevCheckoutId: prev && /^[0-9a-f-]{36}$/.test(prev) ? prev : null };
}
export const quoteCart = async (lines: QuoteRequestLine[], actor?: QuoteActor): Promise<QuoteResult> => {
	const data = await rpc('myr_app_cart_quote', {
		p_lines: lines.map((l) => ({ code: l.code, option_index: l.optionIndex, qty: l.qty, ...(l.gb ? { gb: l.gb } : {}) })),
		p_user_id: actor?.userId ?? null,
		p_prev_checkout_id: actor?.prevCheckoutId ?? null
	});
	const quote = parseCartQuote(data);
	if (quote) return { ok: true, quote };
	const code = (data as { code?: unknown } | null)?.code;
	return { ok: false, code: typeof code === 'string' ? code : 'BAD_RESPONSE' };
};
