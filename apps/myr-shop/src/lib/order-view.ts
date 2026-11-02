/** 주문 조회 — 순수(테스트 src/test/order-view.test.ts). 0060 `myr_order_json` 응답 → 화면 타입 · 상태 라벨 · 비회원 조회 폼 검증. Svelte·DB import 없음. */
import { ORDER_CODE_RE } from './checkout-rules';
import { cleanText, normalizePhone } from './text';

export type OrderItem = {
	id: string;
	code: string;
	name: string;
	option: string;
	qty: number;
	unitPrice: number;
	amount: number;
	status: string;
	refundedQty: number;
	tile: string;
	ic: string;
	thumbUrl: string | null;
	creator: string;
	/** '@minji.routine' — 0065 · 문의 시트 머리 */
	creatorHandle: string;
};
export type OrderShipping = { recipient: string; phone: string; address1: string; address2: string; postcode: string; memo: string };
export type OrderDeposit = { bank: string; account: string; holder: string; due: string | null };
export type OrderView = {
	id: string;
	code: string;
	status: string;
	amount: number;
	itemsAmount: number;
	shippingFee: number;
	refundAmount: number;
	orderName: string;
	paymentMethod: string;
	paidAt: string | null;
	createdAt: string;
	depositDueAt: string | null;
	deposit: OrderDeposit | null;
	courier: string | null;
	trackingNo: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	guest: boolean;
	buyerName: string;
	/** 상세(본인 확인 뒤)에만 실린다 */
	shipping: OrderShipping | null;
	/** 주문 때 받은 이메일 — 상세에만(0065) */
	buyerEmail: string | null;
	items: OrderItem[];
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (o: Record<string, unknown>, k: string, d = ''): string => (typeof o[k] === 'string' ? (o[k] as string) : d);
const strOrNull = (o: Record<string, unknown>, k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
const num = (o: Record<string, unknown>, k: string): number => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : 0);

export function itemFromJson(v: unknown): OrderItem | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	return {
		id: o.id as string,
		code: str(o, 'product_code'),
		name: str(o, 'name'),
		option: str(o, 'option'),
		qty: num(o, 'qty'),
		unitPrice: num(o, 'unit_price'),
		amount: num(o, 'amount'),
		status: str(o, 'status', 'PAID'),
		refundedQty: num(o, 'refunded_qty'),
		tile: str(o, 'tile', 'linear-gradient(145deg,#6b7280,#262a33)'),
		ic: str(o, 'icon', 'pill'),
		thumbUrl: strOrNull(o, 'thumb_url'),
		creator: str(o, 'creator'),
		creatorHandle: str(o, 'creator_handle')
	};
}

export function orderFromJson(v: unknown): OrderView | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string' || typeof o.code !== 'string') return null;
	const ship = obj(o.shipping);
	const dep = obj(o.deposit);
	return {
		id: o.id as string,
		code: o.code as string,
		status: str(o, 'status', 'PAID'),
		amount: num(o, 'amount'),
		itemsAmount: num(o, 'items_amount'),
		shippingFee: num(o, 'shipping_fee'),
		refundAmount: num(o, 'refund_amount'),
		orderName: str(o, 'order_name'),
		paymentMethod: str(o, 'payment_method'),
		paidAt: strOrNull(o, 'paid_at'),
		createdAt: str(o, 'created_at'),
		depositDueAt: strOrNull(o, 'deposit_due_at'),
		deposit: dep ? { bank: str(dep, 'bank'), account: str(dep, 'account'), holder: str(dep, 'holder'), due: strOrNull(dep, 'due') } : null,
		courier: strOrNull(o, 'courier'),
		trackingNo: strOrNull(o, 'tracking_no'),
		shippedAt: strOrNull(o, 'shipped_at'),
		deliveredAt: strOrNull(o, 'delivered_at'),
		guest: o.guest === true,
		buyerName: str(o, 'buyer_name'),
		shipping: ship
			? {
					recipient: str(ship, 'recipient'),
					phone: str(ship, 'phone'),
					address1: str(ship, 'address1'),
					address2: str(ship, 'address2'),
					postcode: str(ship, 'postcode'),
					memo: str(ship, 'memo')
				}
			: null,
		buyerEmail: strOrNull(o, 'buyer_email'),
		items: (Array.isArray(o.items) ? o.items : []).map(itemFromJson).filter((i): i is OrderItem => i !== null)
	};
}

export const ordersFromJson = (v: unknown): OrderView[] => (Array.isArray(v) ? v.map(orderFromJson).filter((o): o is OrderView => o !== null) : []);

/** 상태 라벨 — 주문 status + 배송 컬럼으로 고객이 볼 한 단어. tone 은 색 */
export type StatusLabel = { text: string; tone: 'accent' | 'muted' | 'danger' | 'ok' };
export function statusLabel(o: Pick<OrderView, 'status' | 'trackingNo' | 'shippedAt' | 'deliveredAt'>): StatusLabel {
	switch (o.status) {
		case 'WAITING_DEPOSIT':
			return { text: '입금 대기', tone: 'accent' };
		case 'CANCELED':
			return { text: '취소됨', tone: 'muted' };
		case 'REFUNDED':
			return { text: '환불 완료', tone: 'muted' };
		case 'PARTIAL_REFUNDED':
			return { text: '부분 환불', tone: 'danger' };
		default:
			if (o.deliveredAt) return { text: '배송 완료', tone: 'ok' };
			if (o.shippedAt || o.trackingNo) return { text: '배송 중', tone: 'accent' };
			return { text: '배송 준비중', tone: 'accent' };
	}
}

/** 날짜 짧게 ("11월 2일") — 서버·브라우저 같은 결과(UTC 가 아닌 KST 로 고정) */
export function shortDate(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
	return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

/** 주문번호 표시 — DB 는 소문자(myr1001) · 화면은 대문자 */
export const displayCode = (code: string): string => code.toUpperCase();

/* ---------------- /orders/lookup 폼 ---------------- */

export const GUEST_LOOKUP_FAIL =
	'주문번호와 연락처가 일치하는 주문을 찾지 못했어요 — 주문 완료 화면의 주문번호(예: MYR1001)와 주문 시 입력한 연락처를 확인해주세요';

/** 주문번호(공백·대소문자·앞 # 무시) + 연락처(숫자 8~15) → 소문자 code · 정규화 phone */
export function parseLookupInput(
	codeRaw: unknown,
	phoneRaw: unknown
): { ok: true; code: string; phone: string } | { ok: false; field: 'code' | 'phone'; message: string } {
	const code = cleanText(typeof codeRaw === 'string' ? codeRaw : '')
		.replace(/^#/, '')
		.replace(/\s+/g, '')
		.toLowerCase();
	if (!code) return { ok: false, field: 'code', message: '주문번호를 입력해주세요' };
	if (!ORDER_CODE_RE.test(code)) return { ok: false, field: 'code', message: '주문번호 형식이 올바르지 않아요 (예: MYR1001)' };
	const phoneIn = typeof phoneRaw === 'string' ? phoneRaw : '';
	if (!phoneIn.trim()) return { ok: false, field: 'phone', message: '연락처를 입력해주세요' };
	const phone = normalizePhone(phoneIn);
	if (!phone) return { ok: false, field: 'phone', message: '연락처는 숫자 8~15자리로 입력해주세요' };
	return { ok: true, code, phone };
}

export type LookupResult = { ok: true; orderId: string; orderCode: string; token: string } | { ok: false; code: 'NOT_FOUND' | 'BAD_RESULT' };
export function parseLookupResult(json: unknown): LookupResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT' };
	if (o.ok !== true) return { ok: false, code: o.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'BAD_RESULT' };
	const orderId = str(o, 'order_id');
	const orderCode = str(o, 'order_code');
	const token = str(o, 'token');
	if (!orderId || !orderCode || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, code: 'BAD_RESULT' };
	return { ok: true, orderId, orderCode, token };
}
