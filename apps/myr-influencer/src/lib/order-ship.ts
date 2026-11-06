/**
 * 콘솔 "주문 · 배송" 칸 — 고객 문의 상세(0075) · 교환·환불 요청 상세(0080)가 같은 표를 그린다(대표 피드백 2026-11-06).
 * 상태 판정은 샵 주문 상세와 같은 함수(`statusLabel` · 원칙 1). 배송 칸은 **문의 · 요청이 걸린 줄**의 값(0077) — 섞인 주문에서 다른 크리에이터 박스 송장이 섞이지 않는다.
 * 크리에이터는 출고 일정을 정하지 않는다(MYR 물류 발송) — 이 표는 지금 기록만 보여 준다. 순수(src/test/inquiry.test.ts · claims.test.ts).
 */
import { isShipStatus, shortDate, statusLabel, type ShipStatus } from '@sellery/myr-core/order-view';
import { trackingUrl } from '@sellery/myr-core/ship-rules';

type ShipFields = { courier: string | null; trackingNo: string | null; shippedAt: string | null; deliveredAt: string | null };
/** 주문 + 그 줄 — 줄 배송 상태가 없으면(옛 응답) 주문 칸의 송장으로 */
export type ShipOrder = Partial<ShipFields> & {
	status: string;
	paidAt: string | null;
	item: (ShipFields & { name: string; option: string; qty: number; shipStatus: string | null }) | null;
};
export type OrderShipping = { label: string; cls: string; rows: { k: string; v: string; href?: string | null }[] };
const TONE_CLS = { accent: 'bg-accent/16 text-accent', ok: 'bg-mint/16 text-mint', muted: 'bg-white/6 text-white/60', danger: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' } as const;

export function orderShipping(o: ShipOrder): OrderShipping {
	const it = o.item;
	const line = it?.shipStatus && isShipStatus(it.shipStatus) ? it : null;
	const ship = line
		? { shipStatus: line.shipStatus as ShipStatus, courier: line.courier, trackingNo: line.trackingNo, shippedAt: line.shippedAt, deliveredAt: line.deliveredAt }
		: { shipStatus: null, courier: o.courier ?? null, trackingNo: o.trackingNo ?? null, shippedAt: o.shippedAt ?? null, deliveredAt: o.deliveredAt ?? null };
	const st = statusLabel({ status: o.status, ...ship });
	const rows: OrderShipping['rows'] = [];
	if (it) rows.push({ k: '주문 상품', v: `${it.name}${it.option ? ` (${it.option})` : ''} × ${it.qty}` });
	if (o.paidAt) rows.push({ k: '결제일', v: shortDate(o.paidAt) });
	if (ship.trackingNo) rows.push({ k: '운송장', v: `${ship.courier ?? '택배'} ${ship.trackingNo}`, href: ship.courier ? trackingUrl(ship.courier, ship.trackingNo) : null });
	if (ship.shippedAt) rows.push({ k: '발송일', v: shortDate(ship.shippedAt) });
	if (ship.deliveredAt) rows.push({ k: '배송 완료', v: shortDate(ship.deliveredAt) });
	if (!ship.trackingNo && ship.shipStatus === 'PREPARING') rows.push({ k: '출고', v: 'MYR 물류센터에서 준비 중' });
	if (!ship.trackingNo && ship.shipStatus === 'PAID' && o.status !== 'WAITING_DEPOSIT') rows.push({ k: '출고', v: '발주 전 · 고객이 직접 취소할 수 있어요' });
	if (!ship.trackingNo && !ship.shipStatus && st.text === '배송 준비중') rows.push({ k: '출고', v: 'MYR 물류센터에서 준비 중' });
	return { label: st.text, cls: TONE_CLS[st.tone], rows };
}
