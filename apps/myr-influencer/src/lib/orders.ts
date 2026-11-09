/** 주문(6번 · 0081 · 읽기 전용) — 콘솔 화면 모양만(칩 색 · 날짜 · 송장 줄). 판정(탭 · 상태 칩 · 금액)은 `@sellery/myr-core/seller-orders`.
 *  순수 — $app · $env 를 import 하지 않는다(src/test/orders.test.ts). */
import { shortDate, type StatusLabel } from '@sellery/myr-core/order-view';
import { sellerOrderBoxes, sellerShipStatus, type SellerOrder } from '@sellery/myr-core/seller-orders';
import { trackingUrl } from '@sellery/myr-core/ship-rules';

/** 칩 색 — 문의 · 요청 상세 "주문 · 배송" 칸과 같은 톤(order-ship.ts) */
export const ORDER_TONE_CLS: Record<StatusLabel['tone'], string> = { accent: 'bg-accent/16 text-accent', ok: 'bg-mint/16 text-mint', muted: 'bg-white/6 text-white/60', danger: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' };

export const ORDER_EMPTY: Record<string, string> = {
	all: '아직 들어온 주문이 없어요',
	prep: '출고를 기다리는 주문이 없어요',
	shipping: '배송 중인 주문이 없어요',
	delivered: '배송 완료된 주문이 없어요',
	claim: '진행 중인 교환·환불 요청이 없어요',
	refunded: '환불된 주문이 없어요'
};

/** 카드 둘째 줄 — "11월 4일 결제 · 개*자" */
export const orderMeta = (o: Pick<SellerOrder, 'paidAt' | 'buyer'>): string => [o.paidAt ? `${shortDate(o.paidAt)} 결제` : '', o.buyer].filter(Boolean).join(' · ');

/** 송장 줄 — 내 줄의 박스마다(조회 링크) · 없으면 빈 배열 */
export const orderTracking = (o: Pick<SellerOrder, 'items'>): { text: string; href: string | null }[] =>
	sellerOrderBoxes(o).map((b) => ({ text: `${b.courier ?? '택배'} ${b.trackingNo}`, href: b.courier ? trackingUrl(b.courier, b.trackingNo) : null }));

/** 송장이 아직 없을 때 출고 안내 — 문의 · 요청 상세 "주문 · 배송" 칸과 같은 문구(order-ship.ts) · 남은 줄이 없으면 null */
export function orderShipNote(o: Pick<SellerOrder, 'items'>): string | null {
	const ship = sellerShipStatus(o);
	if (ship === 'PAID') return '발주 전 · 고객이 직접 취소할 수 있어요';
	if (ship === 'PREPARING') return 'MYR 물류센터에서 준비 중';
	return null;
}
