/**
 * 고객 문의(CS) — 0063 RPC 를 service role 로 (packages/db/src/server/cs.server.ts 복사 · 캠페인 → 상품 · brand → seller).
 *   openCs(productCode, input, who)            `myr_app_cs_open` — seller 는 상품에서 파생 · 주문 연결은 소유 증명될 때만(§6.6) · 접수 메일(셀러)
 *   getCsThread(code, key)                     `myr_app_cs_thread(actor='customer')` — client_token(비회원 쿠키) 또는 user_id(회원)
 *   customerReplyCs(code, key, body)           `myr_app_cs_reply(actor='customer')` — ANSWERED → OPEN · CLOSED 면 거부 · 추가 문의 메일(셀러)
 *   listCsForUser(userId)                      `myr_app_cs_list(actor='customer')` — 마이
 *   csForOrder(orderId)                        `myr_app_cs_for_order` — 주문 상세(소유는 라우트가 이미 확인)
 * 셀러 답변·종료(actor='seller'|'admin')는 인플루언서·관리자 콘솔이 같은 RPC 를 부른다(결정 12) — 이 앱엔 없다.
 * actor 와 그 id 는 **세션·쿠키에서만**(원칙 6). 레이트리밋은 라우트가 `rateLimit`.
 */
import { parseCsActionResult, parseCsConversations, parseCsForOrder, parseCsOpenResult, parseCsThread, parseClientToken, PRODUCT_CODE_RE, type CsActionResult, type CsConversation, type CsForOrder, type CsOpenResult, type CsThread, type CsType } from '$lib/cs-rules';
import { parseGuestToken } from '$lib/checkout-rules';
import { admin } from './admin';
import { notifyCsOpened } from './mail-events';

export type CsOpenInput = { type: CsType; body: string; buyerName: string | null; orderCode: string | null };
/** 접수자 — 회원 userId(+ customers.id) · guestToken 은 **그 주문번호의** 비회원 조회 토큰(소유 증명에만 · 로그인 상태에서도 보낸다) */
export type CsOpener = { userId?: string | null; customerId?: string | null; guestToken?: string | null };
export type CsCustomerKey = { clientToken?: string | null; userId?: string | null };

async function productIdOf(code: string): Promise<string | null | 'error'> {
	if (!PRODUCT_CODE_RE.test(code)) return null;
	const { data, error } = await admin().from('myr_products').select('id').eq('code', code).maybeSingle();
	if (error) {
		console.error('[cs] product lookup failed:', error.message);
		return 'error';
	}
	return (data as { id: string } | null)?.id ?? null;
}

export async function openCs(productCode: string, input: CsOpenInput, who: CsOpener = {}): Promise<CsOpenResult> {
	const id = await productIdOf(productCode);
	if (id === 'error') return { ok: false, code: 'DB_ERROR' };
	if (!id) return { ok: false, code: 'NOT_FOUND' };
	const guestToken = input.orderCode ? parseGuestToken(who.guestToken) : null;
	const { data, error } = await admin().rpc('myr_app_cs_open', {
		p_product_id: id,
		p_customer_id: who.customerId ?? null,
		p_user_id: who.userId ?? null,
		p_buyer_name: input.buyerName ?? '',
		p_type: input.type,
		p_body: input.body,
		p_order_code: input.orderCode ?? null,
		p_guest_token: guestToken
	});
	if (error) {
		console.error('[cs] myr_app_cs_open failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const res = parseCsOpenResult(data);
	if (res.ok) await notifyCsOpened(res.conversationId, { messageId: res.conversationId, body: input.body, followUp: false });
	return res;
}

function keyArgs(key: CsCustomerKey): { p_actor_id: string | null; p_client_token: string | null } | null {
	const token = parseClientToken(key.clientToken);
	const user = key.userId && /^[0-9a-f-]{36}$/i.test(key.userId) ? key.userId : null;
	if (!token && !user) return null;
	return { p_actor_id: user, p_client_token: token };
}

/** 고객 스레드 — 토큰·회원 어느 쪽도 없거나 안 맞으면 null(라우트 404) */
export async function getCsThread(code: string, key: CsCustomerKey): Promise<CsThread | null> {
	const args = keyArgs(key);
	if (!args) return null;
	const { data, error } = await admin().rpc('myr_app_cs_thread', { p_code: code.trim().toLowerCase(), p_actor: 'customer', ...args });
	if (error) throw new Error(`myr_app_cs_thread failed: ${error.message}`);
	return parseCsThread(data);
}

export async function customerReplyCs(code: string, key: CsCustomerKey, body: string): Promise<CsActionResult> {
	const args = keyArgs(key);
	if (!args) return { ok: false, code: 'NOT_FOUND' };
	const { data, error } = await admin().rpc('myr_app_cs_reply', { p_code: code.trim().toLowerCase(), p_actor: 'customer', ...args, p_actor_user_id: args.p_actor_id, p_body: body });
	if (error) {
		console.error('[cs] myr_app_cs_reply failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const res = parseCsActionResult(data);
	if (res.ok && res.message) await notifyCsOpened(res.conversationId, { messageId: res.message.id, body: res.message.body, followUp: true });
	return res;
}

export async function listCsForUser(userId: string): Promise<CsConversation[]> {
	const { data, error } = await admin().rpc('myr_app_cs_list', { p_actor: 'customer', p_actor_id: userId, p_status: null });
	if (error) throw new Error(`myr_app_cs_list failed: ${error.message}`);
	return parseCsConversations(data);
}

export async function csForOrder(orderId: string): Promise<CsForOrder[]> {
	const { data, error } = await admin().rpc('myr_app_cs_for_order', { p_order_id: orderId });
	if (error) {
		console.error('[cs] myr_app_cs_for_order failed:', error.message);
		return [];
	}
	return parseCsForOrder(data);
}
