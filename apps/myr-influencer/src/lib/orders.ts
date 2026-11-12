/** 주문(6번 · 0081 · 읽기 전용) — 콘솔 화면 모양만(칩 색 · 날짜 · 줄 상태 · 배송 줄 · 시안 "MYR Influencer Admin" 주문 탭). 판정(탭 · 상태 칩 · 금액)은 `@sellery/myr-core/seller-orders`.
 *  순수 — $app · $env 를 import 하지 않는다(src/test/orders.test.ts). */
import { KIND_LABEL, type ClaimKind } from '@sellery/myr-core/claim-rules';
import { SHIP_LABELS, shortDate } from '@sellery/myr-core/order-view';
import { hasSellerRefund, liveLines, sellerClaimStatus, sellerOrderBoxes, sellerOrderLabel, type SellerOrder, type SellerOrderLine } from '@sellery/myr-core/seller-orders';
import { trackingUrl } from '@sellery/myr-core/ship-rules';

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

/* ---------- 주문 카드(시안 "MYR Influencer Admin" 주문 탭) ---------- */

/** 상태 칩 — 글자는 판정 그대로(sellerOrderLabel · 요청 → 환불 완료/부분 환불 → 배송 상태 · 탭과 같은 순서) · 색만 시안 값
 *  결제 완료 주황 · 배송 준비 흰 · 배송 중 민트 · 배송 완료 · 환불 완료 · 부분 환불 흐림 · 교환·환불 빨강 */
const CHIP_CLS = {
	PAID: 'bg-accent/16 text-accent',
	PREPARING: 'bg-white/8 text-white/85',
	SHIPPING: 'bg-mint/16 text-mint',
	DELIVERED: 'bg-white/6 text-white/50',
	claim: 'bg-[#ff6b6b]/14 text-[#ff8a8a]',
	refunded: 'bg-white/6 text-white/50'
} as const;
export function orderChip(o: Pick<SellerOrder, 'items' | 'shipStatus'>): { text: string; cls: string } {
	const text = sellerOrderLabel(o).text;
	if (sellerClaimStatus(o)) return { text, cls: CHIP_CLS.claim };
	if (!o.shipStatus || hasSellerRefund(o)) return { text, cls: CHIP_CLS.refunded };
	return { text, cls: CHIP_CLS[o.shipStatus] };
}

/** 상품 줄 둘째 줄의 상태 — 진행 중인 요청 → 환불 수량 → 취소 → 그 줄 배송 상태. alert = 빨강(요청 · 환불) */
export function orderLineState(it: Pick<SellerOrderLine, 'claim' | 'refundedQty' | 'status' | 'shipStatus'>): { text: string; alert: boolean } {
	if (it.claim) return { text: `${KIND_LABEL[it.claim.kind as ClaimKind] ?? '교환 · 환불'} ${it.claim.status === 'pending' ? '요청' : '진행 중'}`, alert: true };
	if (it.refundedQty > 0) return { text: `${it.refundedQty}개 환불`, alert: true };
	if (it.status === 'CANCELED') return { text: '취소', alert: true };
	return { text: SHIP_LABELS[it.shipStatus].text, alert: false };
}

/** 진행 중인 교환·환불 요청 — 카드의 [진행 중] 버튼이 가는 요청(내 줄 중 첫 요청) · 없으면 null */
export const orderClaimCode = (o: Pick<SellerOrder, 'items'>): string | null => o.items.find((i) => i.claim)?.claim?.code ?? null;

/** 카드 아래 배송 줄 — 내 줄의 배송 상태(서버 shipStatus)로 한 줄. 배송 중이면 송장(조회 링크 · 박스가 여럿이면 "외 N건") ·
 *  배송 완료면 마지막 배송 완료일 · 남은 줄이 없으면 환불 완료 */
export function orderShipLine(o: Pick<SellerOrder, 'items' | 'shipStatus'>): { text: string; href: string | null } {
	switch (o.shipStatus) {
		case 'PAID':
			return { text: '발주 전 · 고객이 직접 취소할 수 있어요', href: null };
		case 'PREPARING':
			return { text: 'MYR 물류센터에서 준비 중', href: null };
		case 'SHIPPING': {
			const boxes = sellerOrderBoxes(o);
			const b = boxes[0];
			if (!b) return { text: '배송 중', href: null };
			const more = boxes.length > 1 ? ` 외 ${boxes.length - 1}건` : '';
			return { text: `${b.courier ?? '택배'} ${b.trackingNo}${more}`, href: b.courier ? trackingUrl(b.courier, b.trackingNo) : null };
		}
		case 'DELIVERED': {
			const last = liveLines(o)
				.map((i) => i.deliveredAt)
				.filter((d): d is string => !!d)
				.sort()
				.at(-1);
			return { text: last ? `${shortDate(last)} 배송 완료` : '배송 완료', href: null };
		}
		default:
			return { text: '환불 완료', href: null };
	}
}
