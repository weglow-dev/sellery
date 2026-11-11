/**
 * 크리에이터 콘솔 "주문"(6번 · 0081 · 읽기 전용) — 순수 파서 · 판정. 서버는 `server/seller-orders`, 화면은 콘솔 `lib/orders.ts`.
 *   - 주문 1건 = 결제된 주문 중 **내 줄**만(다른 크리에이터 줄 · 금액 · 송장은 DB 가 싣지 않는다). 고객은 가린 이름만.
 *   - 상태 칩 판정: 내 줄에 진행 중인 교환·환불 요청 → 요청 상태(샵 주문 칩과 같은 CLAIM_LABELS) · 남은 줄이 없으면 환불 완료 ·
 *     그 밖엔 내 줄의 배송 상태(SHIP_LABELS) — 서버 값 그대로(0099 myr_order_ship_status(주문, 크리에이터) · 화면이 줄을 훑어 다시 정하지 않는다).
 *   - 금액(결제 · 환불 · 남은 금액)도 서버 값 그대로(amounts · 0099).
 *   - 탭: 교환·환불(진행 중 요청) → 환불(부분 포함) → 배송 상태 — 한 주문은 한 탭에만(sellerOrderTab).
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
	/** 남은 수량 · 살아 있는 줄(취소 아님 · 남은 수량 있음) — 서버 값(0098 myr_line_left · myr_line_live) 그대로. 화면이 다시 계산하지 않는다 */
	leftQty: number;
	live: boolean;
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
		leftQty: n(o.left_qty),
		live: o.live === true,
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
		items
	};
}
export const sellerOrdersFromJson = (v: unknown): SellerOrder[] => (Array.isArray(v) ? v.map(sellerOrderFromJson).filter((o): o is SellerOrder => o !== null) : []);

/** 남은 줄 — 서버가 정한 살아 있는 줄(0098 myr_line_live · 발송 · 정산과 같은 함수) */
export const liveLines = (o: Pick<SellerOrder, 'items'>): SellerOrderLine[] => o.items.filter((i) => i.live);
/** 진행 중인 요청 상태 — 처리 대기가 하나라도 있으면 pending */
export function sellerClaimStatus(o: Pick<SellerOrder, 'items'>): OpenClaimStatus | null {
	const st = o.items.map((i) => i.claim?.status).filter(Boolean);
	return st.includes('pending') ? 'pending' : st.includes('progress') ? 'progress' : null;
}
/** 상태 칩 — 요청 → 환불 완료 → 배송 상태 */
export function sellerOrderLabel(o: Pick<SellerOrder, 'items' | 'shipStatus'>): StatusLabel {
	const claim = sellerClaimStatus(o);
	if (claim) return CLAIM_LABELS[claim];
	return o.shipStatus ? SHIP_LABELS[o.shipStatus] : { text: '환불 완료', tone: 'muted' };
}

/** 환불이 하나라도 있었나 — 내 줄 중 환불 수량이 있거나 취소된 줄(부분 환불 포함) */
export const hasSellerRefund = (o: Pick<SellerOrder, 'items'>): boolean => o.items.some((i) => i.refundedQty > 0 || i.status === 'CANCELED');

/** 목록 탭 — 한 주문은 한 탭에만(2026-11-09 대표 결정). 우선순위 교환·환불(진행 중 요청) → 환불(부분 포함) → 배송 상태.
 *  요청이 끝나면(완료 · 반려) 다시 환불 또는 배송 상태 탭으로 돌아간다. 배송 완료 = 요청 · 환불 없이 끝난 주문 */
export type SellerOrderTab = 'all' | 'prep' | 'shipping' | 'delivered' | 'claim' | 'refunded';
export const SELLER_ORDER_TABS: { id: SellerOrderTab; name: string }[] = [
	{ id: 'all', name: '전체' },
	{ id: 'prep', name: '배송 준비' },
	{ id: 'shipping', name: '배송 중' },
	{ id: 'delivered', name: '배송 완료' },
	{ id: 'claim', name: '교환·환불' },
	{ id: 'refunded', name: '환불' }
];
export function sellerOrderTab(o: Pick<SellerOrder, 'items' | 'shipStatus'>): Exclude<SellerOrderTab, 'all'> {
	if (sellerClaimStatus(o)) return 'claim';
	if (hasSellerRefund(o)) return 'refunded';
	if (!o.shipStatus) return 'refunded';
	return o.shipStatus === 'SHIPPING' ? 'shipping' : o.shipStatus === 'DELIVERED' ? 'delivered' : 'prep';
}
export const filterSellerOrders = <T extends Pick<SellerOrder, 'items' | 'shipStatus'>>(list: T[], tab: SellerOrderTab): T[] => (tab === 'all' ? list : list.filter((o) => sellerOrderTab(o) === tab));
export const sellerOrderTabCounts = (list: Pick<SellerOrder, 'items' | 'shipStatus'>[]) => SELLER_ORDER_TABS.map((t) => ({ ...t, count: filterSellerOrders(list, t.id).length }));

/** 내 줄의 송장(박스) — 같은 택배사 + 송장이면 한 박스 */
export function sellerOrderBoxes(o: Pick<SellerOrder, 'items'>): { courier: string | null; trackingNo: string }[] {
	const seen = new Map<string, { courier: string | null; trackingNo: string }>();
	for (const i of o.items) if (i.trackingNo && i.status !== 'CANCELED') seen.set(`${i.courier ?? ''}|${i.trackingNo}`, { courier: i.courier, trackingNo: i.trackingNo });
	return [...seen.values()];
}
