/**
 * 고객 문의(CS) — 0063 RPC 를 service role 로 (packages/db/src/server/cs.server.ts 복사 · 캠페인 → 상품 · brand → seller).
 *   openCs(productCode, input, who)            `myr_app_cs_open` — seller 는 상품에서 파생 · 주문 연결은 소유 증명될 때만(§6.6) · 접수 메일(셀러)
 *   getCsThread(code, key)                     `myr_app_cs_thread(actor='customer')` — client_token(비회원 쿠키) 또는 user_id(회원)
 *   listCsForUser(userId)                      `myr_app_cs_list(actor='customer')` — 마이
 *   csForOrder(orderId)                        `myr_app_cs_for_order` — 주문 상세(소유는 라우트가 이미 확인)
 * 크리에이터 콘솔(5번 · 0075) — actor='seller' · 크리에이터 id · 계정 id 는 콘솔 서버가 세션(requireSeller)에서:
 *   listSellerCsOfUser(userId) · sellerCsWaitingOfUser(userId)   계정으로 바로(게이트와 동시에 · 0072 방식)
 *   getSellerCsThread(sellerId, code)                           `myr_app_cs_thread(actor='seller')`
 *   answerSellerCs(sellerId, userId, code, body)                답변 등록(`myr_app_cs_reply` + 고객 답변 메일) — 답변 수정은 없다(2026-11-05 대표 결정)
 * actor 와 그 id 는 **세션·쿠키에서만**(원칙 6). 레이트리밋은 라우트가 `rateLimit`.
 */
import {
	CS_CODE_RE,
	isCsFailCode,
	parseCsConversations,
	parseCsForOrder,
	parseCsMessage,
	parseCsOpenResult,
	parseCsThread,
	parseClientToken,
	PRODUCT_CODE_RE,
	type CsConversation,
	type CsFailCode,
	type CsForOrder,
	type CsMessage,
	type CsOpenResult,
	type CsThread,
	type CsType
} from '../cs-rules';
import { parseGuestToken } from '../checkout-rules';
import { admin } from './admin.server';
import { notifyCsOpened, notifyCsReplied } from './mail-events.server';

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
	if (res.ok) await notifyCsOpened(res.conversationId, { messageId: res.conversationId, body: input.body });
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

/* ---------------- 크리에이터 콘솔(0075) ---------------- */

export async function listSellerCsOfUser(userId: string): Promise<CsConversation[]> {
	const { data, error } = await admin().rpc('myr_app_seller_cs_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_cs_of_user failed: ${error.message}`);
	return parseCsConversations(data);
}

/** 답변 대기 수 — 내비 · 홈 뱃지. 실패하면 0(뱃지가 화면을 막지 않게) */
export async function sellerCsWaitingOfUser(userId: string): Promise<number> {
	const { data, error } = await admin().rpc('myr_app_seller_cs_waiting_of_user', { p_user: userId });
	if (error) {
		console.error('[cs] myr_app_seller_cs_waiting_of_user failed:', error.message);
		return 0;
	}
	return typeof data === 'number' ? data : 0;
}

/** 크리에이터의 문의 1건(내 상품 문의만) — 아니면 null(라우트 → 목록) */
export async function getSellerCsThread(sellerId: string, code: string): Promise<CsThread | null> {
	if (!CS_CODE_RE.test(code)) return null;
	const { data, error } = await admin().rpc('myr_app_cs_thread', { p_code: code.trim().toLowerCase(), p_actor: 'seller', p_actor_id: sellerId, p_client_token: null });
	if (error) throw new Error(`myr_app_cs_thread failed: ${error.message}`);
	return parseCsThread(data);
}

export type CsAnswerResult = { ok: true; message: CsMessage; mailed: boolean } | { ok: false; code: CsFailCode };

/** 답변 등록 — 답변 완료 + 고객 답변 메일(받을 이메일이 있는 고객만) */
export async function answerSellerCs(sellerId: string, userId: string, code: string, body: string): Promise<CsAnswerResult> {
	if (!CS_CODE_RE.test(code)) return { ok: false, code: 'NOT_FOUND' };
	const { data, error } = await admin().rpc('myr_app_cs_reply', { p_code: code.trim().toLowerCase(), p_actor: 'seller', p_actor_id: sellerId, p_client_token: null, p_actor_user_id: userId, p_body: body });
	if (error) {
		console.error('[cs] answer failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = (data ?? {}) as Record<string, unknown>;
	if (r.ok !== true) return { ok: false, code: isCsFailCode(r.code) ? r.code : 'DB_ERROR' };
	const message = parseCsMessage(r.message);
	if (!message || typeof r.conversation_id !== 'string') return { ok: false, code: 'DB_ERROR' };
	const mailed = !!(await notifyCsReplied(r.conversation_id, { messageId: message.id, body: message.body }));
	return { ok: true, message, mailed };
}
