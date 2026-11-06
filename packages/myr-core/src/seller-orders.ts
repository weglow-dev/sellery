/**
 * 크리에이터 콘솔 "주문"(6번 · 0081 · 읽기 전용) — 순수 파서 · 판정. 서버는 `server/seller-orders`, 화면은 콘솔 `lib/orders.ts`.
 *   - 주문 1건 = 결제된 주문 중 **내 줄**만(다른 크리에이터 줄 · 금액 · 송장은 DB 가 싣지 않는다). 고객은 가린 이름만.
 *   - 상태 칩 판정: 내 줄에 진행 중인 교환·환불 요청 → 요청 상태(샵 주문 칩과 같은 CLAIM_LABELS) · 남은 줄이 없으면 환불 완료 ·
 *     그 밖엔 남은 줄의 가장 덜 진행된 배송 상태(SHIP_LABELS · 0077 myr_order_ship_status 와 같은 생각).
 */
import { CLAIM_LABELS, isShipStatus, SHIP_LABELS, type OpenClaimStatus, type ShipStatus, type StatusLabel } from './order-view';

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
	shipStatus: ShipStatus;
	courier: string | null;
	trackingNo: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	product: { code: string; tile: string | null; icon: string; thumbUrl: string | null } | null;
	/** 진행 중인 교환·환불 요청(0078) — 없으면 null */
	claim: { code: string; status: OpenClaimStatus; kind: string } | null;
};
export type SellerOrder = { id: string; code: string; status: string; paidAt: string | null; buyer: string; items: SellerOrderLine[] };

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
		shipStatus: isShipStatus(o.ship_status) ? o.ship_status : 'PAID',
		courier: sn(o.courier),
		trackingNo: sn(o.tracking_no),
		shippedAt: sn(o.shipped_at),
		deliveredAt: sn(o.delivered_at),
		product: p ? { code: s(p.code), tile: sn(p.tile), icon: s(p.icon, 'pill'), thumbUrl: sn(p.thumb_url) } : null,
		claim: c && typeof c.code === 'string' && (c.status === 'pending' || c.status === 'progress') ? { code: c.code, status: c.status, kind: s(c.kind) } : null
	};
}
export function sellerOrderFromJson(v: unknown): SellerOrder | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string' || typeof o.code !== 'string') return null;
	const items = (Array.isArray(o.items) ? o.items : []).map(lineFromJson).filter((l): l is SellerOrderLine => l !== null);
	if (!items.length) return null;
	return { id: o.id, code: o.code, status: s(o.status, 'PAID'), paidAt: sn(o.paid_at), buyer: s(o.buyer, '고객'), items };
}
export const sellerOrdersFromJson = (v: unknown): SellerOrder[] => (Array.isArray(v) ? v.map(sellerOrderFromJson).filter((o): o is SellerOrder => o !== null) : []);

/** 남은 줄 — 취소 아님 · 남은 수량 있음 */
export const liveLines = (o: Pick<SellerOrder, 'items'>): SellerOrderLine[] => o.items.filter((i) => i.status !== 'CANCELED' && i.qty - i.refundedQty > 0);
const RANK: Record<ShipStatus, number> = { PAID: 1, PREPARING: 2, SHIPPING: 3, DELIVERED: 4 };
/** 내 줄의 배송 상태 — 남은 줄 중 가장 덜 진행된 것 · 남은 줄이 없으면 null */
export function sellerShipStatus(o: Pick<SellerOrder, 'items'>): ShipStatus | null {
	const live = liveLines(o);
	if (!live.length) return null;
	return live.reduce<ShipStatus>((m, i) => (RANK[i.shipStatus] < RANK[m] ? i.shipStatus : m), 'DELIVERED');
}
/** 진행 중인 요청 상태 — 처리 대기가 하나라도 있으면 pending */
export function sellerClaimStatus(o: Pick<SellerOrder, 'items'>): OpenClaimStatus | null {
	const st = o.items.map((i) => i.claim?.status).filter(Boolean);
	return st.includes('pending') ? 'pending' : st.includes('progress') ? 'progress' : null;
}
/** 상태 칩 — 요청 → 환불 완료 → 배송 상태 */
export function sellerOrderLabel(o: Pick<SellerOrder, 'items'>): StatusLabel {
	const claim = sellerClaimStatus(o);
	if (claim) return CLAIM_LABELS[claim];
	const ship = sellerShipStatus(o);
	return ship ? SHIP_LABELS[ship] : { text: '환불 완료', tone: 'muted' };
}

/** 목록 탭 — 배송 준비(결제 완료 · 배송 준비중) · 배송 중 · 배송 완료 · 환불(내 줄이 모두 환불 · 취소) */
export type SellerOrderTab = 'all' | 'prep' | 'shipping' | 'delivered' | 'refunded';
export const SELLER_ORDER_TABS: { id: SellerOrderTab; name: string }[] = [
	{ id: 'all', name: '전체' },
	{ id: 'prep', name: '배송 준비' },
	{ id: 'shipping', name: '배송 중' },
	{ id: 'delivered', name: '배송 완료' },
	{ id: 'refunded', name: '환불' }
];
export function sellerOrderTab(o: Pick<SellerOrder, 'items'>): Exclude<SellerOrderTab, 'all'> {
	const ship = sellerShipStatus(o);
	if (!ship) return 'refunded';
	return ship === 'SHIPPING' ? 'shipping' : ship === 'DELIVERED' ? 'delivered' : 'prep';
}
export const filterSellerOrders = <T extends Pick<SellerOrder, 'items'>>(list: T[], tab: SellerOrderTab): T[] => (tab === 'all' ? list : list.filter((o) => sellerOrderTab(o) === tab));
export const sellerOrderTabCounts = (list: Pick<SellerOrder, 'items'>[]) => SELLER_ORDER_TABS.map((t) => ({ ...t, count: filterSellerOrders(list, t.id).length }));

/** 내 줄 금액 — 결제 · 환불 · 남은 금액(실적 계산은 0076 이 한다 — 이건 이 주문 카드의 표시만) */
export function sellerOrderAmounts(o: Pick<SellerOrder, 'items'>): { paid: number; refunded: number; net: number } {
	const paid = o.items.reduce((t, i) => t + i.amount, 0);
	const refunded = o.items.reduce((t, i) => t + i.refundAmount, 0);
	return { paid, refunded, net: paid - refunded };
}
/** 내 줄의 송장(박스) — 같은 택배사 + 송장이면 한 박스 */
export function sellerOrderBoxes(o: Pick<SellerOrder, 'items'>): { courier: string | null; trackingNo: string }[] {
	const seen = new Map<string, { courier: string | null; trackingNo: string }>();
	for (const i of o.items) if (i.trackingNo && i.status !== 'CANCELED') seen.set(`${i.courier ?? ''}|${i.trackingNo}`, { courier: i.courier, trackingNo: i.trackingNo });
	return [...seen.values()];
}
