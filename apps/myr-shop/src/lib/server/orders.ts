/** 주문 조회 — 0060 RPC 를 service role 로. 소유 확인: 회원은 RPC 안에서 user_id 대조 · 비회원은 토큰 검증(0058 myr_app_guest_order_verify) 뒤 guest 주문만 열린다. */
import { ORDER_CODE_RE } from '$lib/checkout-rules';
import { orderFromJson, ordersFromJson, parseLookupResult, type LookupResult, type OrderView } from '$lib/order-view';
import { admin } from './admin';
import { verifyGuestOrder } from './customers';

/** 마이 — 내 주문 목록(최신순 · 줄 포함 · 배송지 없음) */
export async function myOrders(userId: string, limit = 20): Promise<OrderView[]> {
	const { data, error } = await admin().rpc('myr_app_my_orders', { p_user_id: userId, p_limit: limit });
	if (error) throw new Error(`myr_app_my_orders failed: ${error.message}`);
	return ordersFromJson(data);
}

/** 회원 주문 상세 — 본인 것이 아니면 null (RPC 가 user_id 를 대조) */
export async function myOrder(userId: string, code: string): Promise<OrderView | null> {
	if (!ORDER_CODE_RE.test(code)) return null;
	const { data, error } = await admin().rpc('myr_app_order_view', { p_order_code: code.toLowerCase(), p_user_id: userId });
	if (error) throw new Error(`myr_app_order_view failed: ${error.message}`);
	return orderFromJson(data);
}

/** 비회원 주문 상세 — 쿠키 토큰이 맞을 때만 (토큰 검증 → guest 주문만 보는 view) */
export async function guestOrder(code: string, tokenRaw: string | undefined | null): Promise<OrderView | null> {
	const id = await verifyGuestOrder(code, tokenRaw);
	if (!id) return null;
	const { data, error } = await admin().rpc('myr_app_order_view', { p_order_code: code.toLowerCase(), p_user_id: null });
	if (error) throw new Error(`myr_app_order_view failed: ${error.message}`);
	const o = orderFromJson(data);
	return o && o.id === id ? o : null;
}

/** 주문번호 + 연락처 → 토큰(회전) */
export async function lookupGuestOrder(code: string, phone: string): Promise<LookupResult> {
	if (!ORDER_CODE_RE.test(code)) return { ok: false, code: 'NOT_FOUND' };
	const { data, error } = await admin().rpc('myr_app_guest_order_lookup', { p_order_code: code, p_phone: phone });
	if (error) throw new Error(`myr_app_guest_order_lookup failed: ${error.message}`);
	return parseLookupResult(data);
}
