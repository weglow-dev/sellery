/**
 * 크리에이터 콘솔 "주문"(6번 · 0081 · 읽기 전용) — 순수 파서 · 판정. 서버는 `server/seller-orders`, 화면은 콘솔 `lib/orders.ts`.
 *   - 주문 1건 = 결제된 주문 중 **내 줄**만(다른 크리에이터 줄 · 금액 · 송장은 DB 가 싣지 않는다). 고객은 가린 이름만.
 *   - 상태 칩 · 탭은 서버 값 그대로(0116 state · tab — myr_seller_order_state · myr_seller_order_tab · 요청 상태 myr_order_claim_status(주문, 크리에이터)).
 *     우선순위 요청 → 환불(남은 줄 없음 환불 완료 · 있음 부분 환불) → 내 줄 배송 상태 — 화면이 줄을 훑어 다시 정하지 않는다. 여기서는 글자만 고른다.
 *   - 금액(결제 · 환불 · 남은 금액)도 서버 값 그대로(amounts · 0099).
 */
import { CLAIM_LABELS, isOpenClaimStatus, isShipStatus, SHIP_LABELS, type OpenClaimStatus, type ShipStatus, type StatusLabel } from './order-view';

export type SellerOrderLine = {
	id: string;
	name: string;
	option: string;
	qty: number;
	unitPrice: number;
	amount: number;
	status: string;
	refundedQty: number;
	refundAmount: number;
	/** 이 줄에 환불이 있었나 — 서버 값(0100 myr_line_has_refund · 환불 수량 > 0 · 홈 CS 비율과 같은 함수) */
	hasRefund: boolean;
	/** 남은 수량 · 살아 있는 줄(취소 아님 · 남은 수량 있음) — 서버 값(0098 myr_line_left · myr_line_live) 그대로. 화면이 다시 계산하지 않는다 */
	leftQty: number;
	live: boolean;
	/** 취소 아닌 줄(0120 myr_line_valid) — 송장(박스) 표시 · 서버 값 그대로 */
	valid: boolean;
	shipStatus: ShipStatus;
	courier: string | null;
	trackingNo: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	product: { code: string; tile: string | null; icon: string; thumbUrl: string | null } | null;
	/** 진행 중인 교환·환불 요청(0078) — 없으면 null */
	claim: { code: string; status: OpenClaimStatus; kind: string } | null;
	/** 공구 링크로 산 줄(0086) */
	groupbuy: boolean;
};
export type SellerOrderAmounts = { paid: number; refunded: number; net: number };
/** 주문 상태(칩) — 서버 값(0116 myr_seller_order_state) */
export type SellerOrderState = 'claim_pending' | 'claim_progress' | 'refunded' | 'partial_refunded' | ShipStatus;
const ORDER_STATES: readonly string[] = ['claim_pending', 'claim_progress', 'refunded', 'partial_refunded', 'PAID', 'PREPARING', 'SHIPPING', 'DELIVERED'];
export type SellerOrder = {
	id: string;
	code: string;
	status: string;
	paidAt: string | null;
	buyer: string;
	/** 내 줄의 배송 상태 — 살아 있는 줄 중 가장 덜 진행된 것 · 없으면 null (0099 서버 값) */
	shipStatus: ShipStatus | null;
	/** 내 줄 금액 — 결제 · 환불 · 남은 금액(0099 서버 값 · net = myr_line_net 합) */
	amounts: SellerOrderAmounts;
	/** 내 줄의 열린 요청 상태(처리 대기 > 진행 중 · 없으면 null) · 주문 상태(칩) · 탭 — 서버 값(0116) */
	claimStatus: OpenClaimStatus | null;
	state: SellerOrderState;
	tab: Exclude<SellerOrderTab, 'all'>;
	items: SellerOrderLine[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const sn = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function lineFromJson(v: unknown): SellerOrderLine | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string') return null;
	const p = obj(o.product);
	const c = obj(o.claim);
	return {
		id: o.id,
		name: s(o.name),
		option: s(o.option),
		qty: n(o.qty),
		unitPrice: n(o.unit_price),
		amount: n(o.amount),
		status: s(o.status, 'PAID'),
		refundedQty: n(o.refunded_qty),
		refundAmount: n(o.refund_amount),
		hasRefund: o.has_refund === true,
		leftQty: n(o.left_qty),
		live: o.live === true,
		valid: o.valid === true,
		shipStatus: isShipStatus(o.ship_status) ? o.ship_status : 'PAID',
		courier: sn(o.courier),
		trackingNo: sn(o.tracking_no),
		shippedAt: sn(o.shipped_at),
		deliveredAt: sn(o.delivered_at),
		product: p ? { code: s(p.code), tile: sn(p.tile), icon: s(p.icon, 'pill'), thumbUrl: sn(p.thumb_url) } : null,
		claim: c && typeof c.code === 'string' && isOpenClaimStatus(c.status) ? { code: c.code, status: c.status, kind: s(c.kind) } : null,
		groupbuy: o.groupbuy === true
	};
}
export function sellerOrderFromJson(v: unknown): SellerOrder | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string' || typeof o.code !== 'string') return null;
	const items = (Array.isArray(o.items) ? o.items : []).map(lineFromJson).filter((l): l is SellerOrderLine => l !== null);
	if (!items.length) return null;
	const a = obj(o.amounts);
	return {
		id: o.id,
		code: o.code,
		status: s(o.status, 'PAID'),
		paidAt: sn(o.paid_at),
		buyer: s(o.buyer, '고객'),
		shipStatus: isShipStatus(o.ship_status) ? o.ship_status : null,
		amounts: { paid: n(a?.paid), refunded: n(a?.refunded), net: n(a?.net) },
		claimStatus: isOpenClaimStatus(o.claim_status) ? o.claim_status : null,
		state: ORDER_STATES.includes(o.state as string) ? (o.state as SellerOrderState) : 'PAID',
		tab: ORDER_TABS.includes(o.tab as string) ? (o.tab as Exclude<SellerOrderTab, 'all'>) : 'prep',
		items
	};
}
export const sellerOrdersFromJson = (v: unknown): SellerOrder[] => (Array.isArray(v) ? v.map(sellerOrderFromJson).filter((o): o is SellerOrder => o !== null) : []);

/** 남은 줄 — 서버가 정한 살아 있는 줄(0098 myr_line_live · 발송 · 정산과 같은 함수) */
export const liveLines = (o: Pick<SellerOrder, 'items'>): SellerOrderLine[] => o.items.filter((i) => i.live);
/** 진행 중인 요청 상태 — 서버 값(0116 myr_order_claim_status(주문, 크리에이터) · 처리 대기 > 진행 중) */
export const sellerClaimStatus = (o: Pick<SellerOrder, 'claimStatus'>): OpenClaimStatus | null => o.claimStatus;
/** 이 줄에 환불이 있었나 — 서버 값 그대로(0100 myr_line_has_refund). 주문 탭 · 상태 칩 · 카드 줄 상태가 이 함수로 읽는다(화면이 수량으로 다시 판정하지 않는다) */
export const lineHasRefund = (i: Pick<SellerOrderLine, 'hasRefund'>): boolean => i.hasRefund;
/** 환불이 하나라도 있었나 — 내 줄 중 lineHasRefund 인 줄이 있으면 */
export const hasSellerRefund = (o: Pick<SellerOrder, 'items'>): boolean => o.items.some(lineHasRefund);

/** 상태 칩 글자 — 서버 상태(0116 state · 탭과 같은 우선순위) 그대로 고른다.
 *  "환불 완료" 탭의 주문이 배송 상태 칩(배송 완료 등)으로 보이지 않게 — 남은 줄의 배송은 카드 아래 배송 줄이 보여 준다 */
export function sellerOrderLabel(o: Pick<SellerOrder, 'state'>): StatusLabel {
	switch (o.state) {
		case 'claim_pending':
			return CLAIM_LABELS.pending;
		case 'claim_progress':
			return CLAIM_LABELS.progress;
		case 'refunded':
			return { text: '환불 완료', tone: 'muted' };
		case 'partial_refunded':
			return { text: '부분 환불', tone: 'muted' };
		default:
			return SHIP_LABELS[o.state];
	}
}

/** 목록 탭 — 한 주문은 한 탭에만(2026-11-09 대표 결정). 우선순위 교환·환불(진행 중 요청) → 환불 완료(부분 포함 · 2026-11-12 이름 "환불" → "환불 완료") → 배송 상태.
 *  요청이 끝나면(완료 · 반려) 다시 환불 또는 배송 상태 탭으로 돌아간다. 배송 완료 = 요청 · 환불 없이 끝난 주문 */
export type SellerOrderTab = 'all' | 'prep' | 'shipping' | 'delivered' | 'claim' | 'refunded';
export const SELLER_ORDER_TABS: { id: SellerOrderTab; name: string }[] = [
	{ id: 'all', name: '전체' },
	{ id: 'prep', name: '배송 준비' },
	{ id: 'shipping', name: '배송 중' },
	{ id: 'delivered', name: '배송 완료' },
	{ id: 'claim', name: '교환·환불' },
	{ id: 'refunded', name: '환불 완료' }
];
const ORDER_TABS: readonly string[] = ['prep', 'shipping', 'delivered', 'claim', 'refunded'];
/** 탭 — 서버 값(0116 myr_seller_order_tab) */
export const sellerOrderTab = (o: Pick<SellerOrder, 'tab'>): Exclude<SellerOrderTab, 'all'> => o.tab;
export const filterSellerOrders = <T extends Pick<SellerOrder, 'tab'>>(list: T[], tab: SellerOrderTab): T[] => (tab === 'all' ? list : list.filter((o) => o.tab === tab));
export const sellerOrderTabCounts = (list: Pick<SellerOrder, 'tab'>[]) => SELLER_ORDER_TABS.map((t) => ({ ...t, count: filterSellerOrders(list, t.id).length }));

/** 내 줄의 송장(박스) — 같은 택배사 + 송장이면 한 박스 · 취소 줄 제외(서버 valid · 0120) */
export function sellerOrderBoxes(o: Pick<SellerOrder, 'items'>): { courier: string | null; trackingNo: string }[] {
	const seen = new Map<string, { courier: string | null; trackingNo: string }>();
	for (const i of o.items) if (i.trackingNo && i.valid) seen.set(`${i.courier ?? ''}|${i.trackingNo}`, { courier: i.courier, trackingNo: i.trackingNo });
	return [...seen.values()];
}
