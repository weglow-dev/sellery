/**
 * 고객 문의(CS) 순수 규칙 — 접수 폼 · 스레드 파서 · 문구 · 쿠키 이름 (packages/db/src/cs/cs-rules.ts 복사 · MYR 은 상품 단위 · brand → seller).
 * 브라우저 `.svelte` 와 서버 양쪽. DB 호출은 `./server/cs.ts`. 테스트 src/test/cs-rules.test.ts.
 */
import { cleanText } from './text';

/** 0063 myr_cs_conversations.type 제약과 같은 4개 */
export const CS_TYPES = ['배송 문의', '교환·반품', '상품 문의', '기타'] as const;
export type CsType = (typeof CS_TYPES)[number];
export const isCsType = (v: unknown): v is CsType => typeof v === 'string' && (CS_TYPES as readonly string[]).includes(v);

export const CS_BODY_MAX = 2000;
export const CS_BUYER_NAME_MAX = 40;
export const CS_ORDER_CODE_MAX = 32;
export const CS_CODE_RE = /^cs\d{1,10}$/i;
export const PRODUCT_CODE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

export type CsStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';
export const isCsStatus = (v: unknown): v is CsStatus => v === 'OPEN' || v === 'ANSWERED' || v === 'CLOSED';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const intOr = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d);

function formToObj(raw: unknown): Obj | null {
	if (typeof FormData !== 'undefined' && raw instanceof FormData) return Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === 'string'));
	return obj(raw);
}

/** 본문 정규화 — 0063 myr_cs_normalize_body 와 같은 결과(제어문자 제거 · 개행 유지 · 빈 줄 3개 이상 → 2개 · 앞뒤 공백) */
export function normalizeCsBody(raw: string | null | undefined): string {
	return String(raw ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/* ---------------- 폼 ---------------- */
export type CsOpenField = 'type' | 'body' | 'buyer_name' | 'order_code';
export const CS_OPEN_FIELD_MESSAGES: Record<CsOpenField, string> = {
	type: '문의 유형을 선택해주세요',
	body: `문의 내용을 입력해주세요 (${CS_BODY_MAX}자까지)`,
	buyer_name: `이름은 ${CS_BUYER_NAME_MAX}자까지예요`,
	order_code: '주문번호 형식을 확인해주세요 (예: MYR1001)'
};
export type ParsedCsOpenInput = { ok: true; type: CsType; body: string; buyerName: string | null; orderCode: string | null } | { ok: false; field: CsOpenField; message: string };

export function parseCsOpenInput(raw: unknown): ParsedCsOpenInput {
	const src = formToObj(raw);
	const type = str(src?.type).trim();
	if (!isCsType(type)) return { ok: false, field: 'type', message: CS_OPEN_FIELD_MESSAGES.type };
	const body = normalizeCsBody(str(src?.body));
	if (!body || body.length > CS_BODY_MAX) return { ok: false, field: 'body', message: CS_OPEN_FIELD_MESSAGES.body };
	const buyerName = cleanText(str(src?.buyer_name));
	if (buyerName.length > CS_BUYER_NAME_MAX) return { ok: false, field: 'buyer_name', message: CS_OPEN_FIELD_MESSAGES.buyer_name };
	const orderCode = str(src?.order_code).trim();
	if (orderCode && !ORDER_CODE_RE.test(orderCode)) return { ok: false, field: 'order_code', message: CS_OPEN_FIELD_MESSAGES.order_code };
	return { ok: true, type, body, buyerName: buyerName || null, orderCode: orderCode ? orderCode.toLowerCase() : null };
}

/* ---------------- 행 · 스레드 (myr_cs_conversation_json · myr_cs_thread_json) ---------------- */
/** 문의에 붙은 주문 줄 — 배송 칸은 0077(줄 단위 배송) · 옛 응답이면 null */
export type CsOrderItem = {
	id: string;
	name: string;
	option: string;
	qty: number;
	amount: number;
	status: string;
	refundedQty: number;
	shipStatus: string | null;
	courier: string | null;
	trackingNo: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
};
export type CsOrderSummary = { code: string; status: string; courier: string | null; trackingNo: string | null; shippedAt: string | null; deliveredAt: string | null; paidAt: string | null; item: CsOrderItem | null };
export type CsConversation = {
	id: string;
	code: string;
	status: CsStatus;
	type: string;
	buyerName: string;
	orderCode: string | null;
	orderId: string | null;
	/** 소유 증명된 주문만(§6.6) · item = 그 주문 안 이 상품의 줄 */
	order: CsOrderSummary | null;
	isMember: boolean;
	lastPreview: string | null;
	lastMessageAt: string;
	repliedAt: string | null;
	closedAt: string | null;
	createdAt: string;
	messageCount: number;
	/** 첫 질문(0064 · 200자) — 마이 "내 문의" 제목 */
	firstBody: string | null;
	/** 가장 최근 크리에이터 답변(0075 · 운영 대행 포함 · 300자) — 콘솔 "내 답변" · 목록 "↩ 답변" 줄. 답변 전이면 null */
	answer: CsAnswer | null;
	product: { id: string; code: string; name: string; tile: string | null; icon: string; thumbUrl: string | null; status: string } | null;
	seller: { id: string; name: string; handle: string } | null;
};
export type CsAnswer = { id: string; body: string; createdAt: string };
export type CsMessage = { id: string; sender: 'customer' | 'seller' | 'admin'; actorRole: string; body: string; createdAt: string };
export type CsThread = { conversation: CsConversation; messages: CsMessage[] };

export function parseCsConversation(json: unknown): CsConversation | null {
	const o = obj(json);
	if (!o) return null;
	const id = strOrNull(o.id);
	const code = strOrNull(o.code);
	if (!id || !code || !isCsStatus(o.status)) return null;
	const ord = obj(o.order);
	const it = ord ? obj(ord.item) : null;
	const p = obj(o.product);
	const s = obj(o.seller);
	const a = obj(o.answer);
	return {
		id,
		code,
		status: o.status,
		type: str(o.type, '기타'),
		buyerName: str(o.buyer_name, '고객'),
		orderCode: strOrNull(o.order_code),
		orderId: strOrNull(o.order_id),
		order:
			ord && strOrNull(ord.code)
				? {
						code: str(ord.code),
						status: str(ord.status),
						courier: strOrNull(ord.courier),
						trackingNo: strOrNull(ord.tracking_no),
						shippedAt: strOrNull(ord.shipped_at),
						deliveredAt: strOrNull(ord.delivered_at),
						paidAt: strOrNull(ord.paid_at),
						item:
							it && strOrNull(it.id)
								? {
										id: str(it.id),
										name: str(it.name),
										option: str(it.option),
										qty: intOr(it.qty, 1),
										amount: intOr(it.amount),
										status: str(it.status),
										refundedQty: intOr(it.refunded_qty),
										shipStatus: strOrNull(it.ship_status),
										courier: strOrNull(it.courier),
										trackingNo: strOrNull(it.tracking_no),
										shippedAt: strOrNull(it.shipped_at),
										deliveredAt: strOrNull(it.delivered_at)
									}
								: null
					}
				: null,
		isMember: o.is_member === true,
		lastPreview: strOrNull(o.last_preview),
		lastMessageAt: str(o.last_message_at, str(o.created_at)),
		repliedAt: strOrNull(o.replied_at),
		closedAt: strOrNull(o.closed_at),
		createdAt: str(o.created_at),
		messageCount: intOr(o.message_count),
		firstBody: strOrNull(o.first_body),
		answer: a && strOrNull(a.id) && typeof a.body === 'string' ? { id: str(a.id), body: a.body, createdAt: str(a.created_at) } : null,
		product: p && strOrNull(p.id) ? { id: str(p.id), code: str(p.code), name: str(p.name), tile: strOrNull(p.tile), icon: str(p.icon, 'pill'), thumbUrl: strOrNull(p.thumb_url), status: str(p.status) } : null,
		seller: s && strOrNull(s.id) ? { id: str(s.id), name: str(s.name), handle: str(s.handle) } : null
	};
}
export const parseCsConversations = (json: unknown): CsConversation[] => (Array.isArray(json) ? json.map(parseCsConversation).filter((x): x is CsConversation => x !== null) : []);

export function parseCsMessage(json: unknown): CsMessage | null {
	const o = obj(json);
	if (!o) return null;
	const id = strOrNull(o.id);
	const body = strOrNull(o.body);
	const createdAt = strOrNull(o.created_at);
	const sender = o.sender;
	if (!id || body === null || !createdAt || (sender !== 'customer' && sender !== 'seller' && sender !== 'admin')) return null;
	return { id, sender, actorRole: str(o.actor_role, sender), body, createdAt };
}
export function parseCsThread(json: unknown): CsThread | null {
	const o = obj(json);
	if (!o) return null;
	const conversation = parseCsConversation(o.conversation);
	if (!conversation) return null;
	const messages = Array.isArray(o.messages) ? o.messages.map(parseCsMessage).filter((m): m is CsMessage => m !== null) : [];
	return { conversation, messages };
}

/** 주문 상세의 "이 주문의 문의" — 문의마다 스레드(대화 + 메시지 · 0079 myr_app_cs_for_order). 마이 "내 문의" 와 같은 아코디언이 그린다 */
export const parseCsThreads = (json: unknown): CsThread[] => (Array.isArray(json) ? json.map(parseCsThread).filter((t): t is CsThread => t !== null) : []);

/* ---------------- RPC 결과 ---------------- */
export type CsFailCode = 'NOT_FOUND' | 'BAD_TYPE' | 'BAD_BODY' | 'BAD_ACTOR' | 'CLOSED' | 'RATE_LIMITED' | 'DB_ERROR';
const FAIL_CODES: readonly string[] = ['NOT_FOUND', 'BAD_TYPE', 'BAD_BODY', 'BAD_ACTOR', 'CLOSED', 'RATE_LIMITED', 'DB_ERROR'];
export const isCsFailCode = (v: unknown): v is CsFailCode => typeof v === 'string' && FAIL_CODES.includes(v);

export type CsOpenResult =
	| { ok: true; conversationId: string; conversationCode: string; clientToken: string; sellerId: string; sellerName: string | null; orderId: string | null; orderItemId: string | null; orderMatched: boolean }
	| { ok: false; code: CsFailCode };
export function parseCsOpenResult(json: unknown): CsOpenResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'DB_ERROR' };
	if (o.ok === true) {
		const conversationId = strOrNull(o.conversation_id);
		const conversationCode = strOrNull(o.conversation_code);
		const clientToken = strOrNull(o.client_token);
		const sellerId = strOrNull(o.seller_id);
		if (!conversationId || !conversationCode || !clientToken || !sellerId) return { ok: false, code: 'DB_ERROR' };
		return { ok: true, conversationId, conversationCode, clientToken, sellerId, sellerName: strOrNull(o.seller_name), orderId: strOrNull(o.order_id), orderItemId: strOrNull(o.order_item_id), orderMatched: o.order_matched === true };
	}
	return { ok: false, code: isCsFailCode(o.code) ? o.code : 'DB_ERROR' };
}

/* ---------------- 문구 · 칩 ---------------- */
export const CS_FAIL_MESSAGES: Record<CsFailCode, string> = {
	NOT_FOUND: '문의를 찾을 수 없어요',
	BAD_TYPE: CS_OPEN_FIELD_MESSAGES.type,
	BAD_BODY: CS_OPEN_FIELD_MESSAGES.body,
	BAD_ACTOR: '권한이 없어요',
	CLOSED: '처리 종료된 문의예요 — 추가 문의는 새로 접수해주세요',
	RATE_LIMITED: '요청이 많아요 — 잠시 후 다시 시도해주세요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};
export const csFailMessage = (code: string): string => (isCsFailCode(code) ? CS_FAIL_MESSAGES[code] : CS_FAIL_MESSAGES.DB_ERROR);

export const CS_DONE_MESSAGES = {
	opened: (sellerName: string | null) => `문의가 ${sellerName ?? '크리에이터'}에게 전달되었어요 — 답변이 달리면 이 화면과 이메일로 알려드려요`
} as const;

export type CsChipTone = 'accent' | 'ok' | 'muted';
export const CS_STATUS_CHIPS: Record<CsStatus, { label: string; tone: CsChipTone }> = {
	OPEN: { label: '답변 대기', tone: 'accent' },
	ANSWERED: { label: '답변 완료', tone: 'ok' },
	CLOSED: { label: '처리 종료', tone: 'muted' }
};
export const csStatusChip = (status: string): { label: string; tone: CsChipTone } => (isCsStatus(status) ? CS_STATUS_CHIPS[status] : { label: status, tone: 'muted' });

export function csSenderLabel(sender: CsMessage['sender'], sellerName?: string | null): string {
	if (sender === 'customer') return '나';
	if (sender === 'admin') return 'MYR 운영팀';
	return sellerName || '크리에이터';
}

/* ---------------- 비회원 토큰 쿠키 ---------------- */
/** `myr_cs_<code>` = client_token — 접수 응답에서 1회 받아 HttpOnly 쿠키. 회원은 user_id 로 열리므로 쿠키가 없어도 된다 */
export const CS_TOKEN_COOKIE = 'myr_cs_';
export const CS_TOKEN_COOKIE_DAYS = 90;
export const csTokenCookieName = (conversationCode: string): string => `${CS_TOKEN_COOKIE}${conversationCode.toLowerCase()}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const parseClientToken = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);


/** 상대 시각 — "방금" · "N분 전" · "N시간 전" · "어제" · "N일 전" · "N주 전" · 그 뒤는 "M월 D일"(KST). now 주입 가능(테스트) */
export function relTime(iso: string | null | undefined, now: number = Date.now()): string {
	if (!iso) return '';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return '';
	const min = Math.floor((now - t) / 60_000);
	if (min < 1) return '방금';
	if (min < 60) return `${min}분 전`;
	const kstDay = (ms: number) => Math.floor((ms + 9 * 3_600_000) / 86_400_000);
	const days = kstDay(now) - kstDay(t);
	if (days <= 0) return `${Math.floor(min / 60)}시간 전`;
	if (days === 1) return '어제';
	if (days < 7) return `${days}일 전`;
	if (days < 28) return `${Math.floor(days / 7)}주 전`;
	const k = new Date(t + 9 * 3_600_000);
	return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/* ---------------- 상품 페이지 문의 시트 (대표 시안 2026-11-02) ---------------- */
/** 주문번호 선택이 나오는 유형 — 배송 문의 · 교환·반품 만 */
export const CS_ORDER_TYPES: readonly CsType[] = ['배송 문의', '교환·반품'];
export const csNeedsOrder = (type: string): boolean => (CS_ORDER_TYPES as readonly string[]).includes(type);
export const CS_PLACEHOLDERS: Record<CsType, string> = {
	'배송 문의': '배송 상태, 도착 예정일 등 궁금한 점을 적어주세요',
	'교환·반품': '교환·반품하려는 이유와 받은 상품의 상태를 적어주세요',
	'상품 문의': '성분, 함량, 효과 등 궁금한 점을 적어주세요',
	기타: '궁금한 점을 자유롭게 적어주세요'
};

/** 주문 드롭다운 옵션 — 내 주문 중 **이 상품 줄이 있는** 것만(최신순 그대로) · 라벨 "MYR1001 · 11월 2일 · 상품 × 2" */
export type CsOrderOption = { code: string; label: string };
export function csOrderOptions(
	orders: readonly { code: string; createdAt: string; items: readonly { code: string; name: string; qty: number }[] }[],
	productCode: string,
	fmtDate: (iso: string) => string
): CsOrderOption[] {
	const out: CsOrderOption[] = [];
	for (const o of orders) {
		const line = o.items.find((i) => i.code === productCode);
		if (!line) continue;
		out.push({ code: o.code, label: `${o.code.toUpperCase()} · ${fmtDate(o.createdAt)} · ${line.name} × ${line.qty}` });
	}
	return out;
}
