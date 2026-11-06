/**
 * CS 관리 › 고객 문의(docs/myr.md §4.2.1 5번 · 0075 · 시안 "MYR Influencer Admin" · "… PC" 의 inq*) — 순수 규칙. src/test/inquiry.test.ts.
 *   - 문의 1건 = 고객 질문(첫 고객 메시지) + 내 답변(가장 최근 크리에이터 메시지 · 운영 대행 포함). DB 는 스레드(0063)지만 고객 추가 문의는 없앴다(S7-5).
 *   - 답변 수정은 없다(2026-11-05 대표 결정 — 시안의 [답변 수정] 은 넣지 않음).
 *   - 상태는 시안의 둘 — 답변 대기(OPEN) · 답변 완료(ANSWERED · 운영팀이 종료한 CLOSED 도 여기). 콘솔에서는 종료하지 않는다(시안에 없음).
 *   - 자주 쓰는 답변 · 답변 기준 문구는 시안 그대로(크리에이터 이름만 바꿔 넣음) — 단, "상품 상세 Q&A 공개" 는 MYR 에 없는 기능이라 실제 동작(메일 · 내 문의)으로 바꿨다.
 */
import type { CsConversation, CsMessage, CsThread } from '@sellery/myr-core/cs-rules';
import { displayCode, isShipStatus, shortDate, statusLabel, type ShipStatus } from '@sellery/myr-core/order-view';
import { trackingUrl } from '@sellery/myr-core/ship-rules';

export type InqTab = 'waiting' | 'answered' | 'all';
export const INQ_TABS: { id: InqTab; name: string }[] = [
	{ id: 'waiting', name: '답변 대기' },
	{ id: 'answered', name: '답변 완료' },
	{ id: 'all', name: '전체' }
];

export const isWaiting = (c: Pick<CsConversation, 'status'>) => c.status === 'OPEN';
export const filterInquiries = <T extends Pick<CsConversation, 'status'>>(list: T[], tab: InqTab): T[] =>
	tab === 'all' ? list : list.filter((c) => (tab === 'waiting') === isWaiting(c));
export const inqTabCounts = (list: Pick<CsConversation, 'status'>[]) => INQ_TABS.map((t) => ({ ...t, count: filterInquiries(list, t.id).length }));
export const INQ_EMPTY: Record<InqTab, string> = { waiting: '모든 문의에 답변했어요', answered: '아직 답변한 문의가 없어요', all: '아직 들어온 문의가 없어요' };

/** 상태 칩 */
export const inqStatus = (c: Pick<CsConversation, 'status'>) =>
	isWaiting(c) ? { label: '답변 대기', cls: 'bg-accent/16 text-accent' } : { label: '답변 완료', cls: 'bg-white/6 text-white/60' };

/** 유형 칩 색 — 시안 inqTypeMeta */
const TYPE_CLS: Record<string, string> = {
	'상품 문의': 'bg-accent/16 text-accent',
	'배송 문의': 'bg-[#b8c4f5]/18 text-[#b8c4f5]',
	'교환·반품': 'bg-mint/16 text-mint',
	기타: 'bg-white/8 text-white/75'
};
export const inqTypeCls = (type: string) => TYPE_CLS[type] ?? TYPE_CLS['기타'];

/** 상품 카드 아래 줄 — 소유가 확인된 주문만 주문번호(§6.6 · 화면은 대문자) · 아니면 "주문 전 문의" */
export const inqOrderText = (c: Pick<CsConversation, 'order'>) => (c.order ? `주문 ${displayCode(c.order.code)}` : '주문 전 문의');

/** 주문 · 배송(문의 상세) — 소유가 확인된 주문만. 상태 판정은 샵 주문 상세와 같은 함수(`statusLabel` · 원칙 1).
 *  크리에이터는 출고 일정을 정하지 않는다(MYR 물류 발송) — 이 표는 지금 기록만 보여 준다. 주문이 없으면 null */
export type InqShipping = { label: string; cls: string; rows: { k: string; v: string; href?: string | null }[] };
const TONE_CLS = { accent: 'bg-accent/16 text-accent', ok: 'bg-mint/16 text-mint', muted: 'bg-white/6 text-white/60', danger: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' } as const;
export function inqShipping(c: Pick<CsConversation, 'order'>): InqShipping | null {
	const o = c.order;
	if (!o) return null;
	// 줄 배송(0077)이 있으면 그 줄 값 — 한 주문에 크리에이터가 여럿이면 줄마다 다르다. 옛 응답이면 주문 칸
	const it = o.item;
	const line = it?.shipStatus && isShipStatus(it.shipStatus) ? it : null;
	const ship = line
		? { shipStatus: line.shipStatus as ShipStatus, courier: line.courier, trackingNo: line.trackingNo, shippedAt: line.shippedAt, deliveredAt: line.deliveredAt }
		: { shipStatus: null, courier: o.courier, trackingNo: o.trackingNo, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt };
	const st = statusLabel({ status: o.status, ...ship });
	const rows: InqShipping['rows'] = [];
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

/** 고객 질문 — 첫 고객 메시지 · 없으면 목록의 first_body */
export const questionOf = (t: CsThread): string => t.messages.find((m) => m.sender === 'customer')?.body ?? t.conversation.firstBody ?? '';
/** 내 답변 — 가장 최근 크리에이터 메시지(운영 대행 포함) */
export const answerOf = (t: CsThread): CsMessage | null => [...t.messages].reverse().find((m) => m.sender === 'seller') ?? null;

/** "민지 루틴이에요" · "하루예요" — 이름 끝 글자 받침으로 이에요/예요 */
export function ieyo(name: string): string {
	const last = name.trim().slice(-1);
	const code = last.charCodeAt(0) - 0xac00;
	if (code < 0 || code > 11171) return `${name}이에요`;
	return code % 28 ? `${name}이에요` : `${name}예요`;
}

/** 자주 쓰는 답변(유형별 + 감사 인사) — 시안 inqTpl · inqThanks. 기타 · 모르는 유형은 감사 인사만(2026-11-05 "확인 후 안내" 뺌).
 *  크리에이터가 약속할 수 없는 것(출고 날짜 · 재발송 · MYR 부담)은 문구에서 뺐다(2026-11-05 대표 결정 — 발송은 MYR 물류 · 교환·반품 정책은 §9-15 미정) */
export function inquiryTemplates(type: string, sellerName: string): { name: string; text: string }[] {
	const hi = `안녕하세요, ${ieyo(sellerName)}`;
	const byType: Record<string, { name: string; text: string }[]> = {
		'상품 문의': [{ name: '섭취 방법 안내', text: `${hi} :) 하루 1포, 식사 후 30분 안에 드시면 가장 좋아요. 저녁 식사 후에 드셔도 괜찮아요!` }],
		'배송 문의': [
			{ name: '출고 일정 안내', text: `${hi}. 주문하신 상품은 물류센터에서 주문 순서대로 출고하고 있어요. 출고되면 송장번호를 메일과 주문 내역으로 알려드릴게요.` },
			{ name: '지연 사과', text: '기다리게 해서 정말 죄송해요. 주문이 몰려 출고가 조금 늦어지고 있어요. 출고되는 대로 송장번호를 메일과 주문 내역으로 알려드릴게요.' }
		],
		'교환·반품': [
			{ name: '교환 절차 안내', text: '불편을 드려 죄송해요. 주문 내역에서 교환 · 환불 신청을 누르고 사진을 함께 올려주시면, 확인 후 안내드릴게요.' },
			{ name: '파손 접수 안내', text: '포장 파손으로 불편을 드려 죄송해요. 주문 내역에서 교환 · 환불 신청을 누르고 파손된 사진을 올려주시면, 확인 후 빠르게 처리해드릴게요.' }
		]
	};
	return [...(byType[type] ?? []), { name: '감사 인사', text: '문의 남겨주셔서 감사해요! 앞으로도 좋은 제품으로 보답할게요 :)' }];
}

/** 답변 기준 — 유형별 한 줄(있는 유형만) + 공통 한 줄. 없는 유형은 빈 줄을 만들지 않는다 */
export function inquiryGuide(type: string): string[] {
	const byType: Record<string, string> = {
		'상품 문의': '섭취·성분 질문은 상세페이지에 적힌 내용과 같게 안내해주세요',
		// '배송 문의': '출고 예정일을 날짜로 구체적으로 알려주세요',
		// '교환·반품': '실제 교환·반품은 고객이 주문 내역에서 신청하면 교환 · 환불 탭으로 들어와요',
		// 기타: '할인·대량 구매는 MYR 파트너팀과 확인한 뒤 안내해주세요'
	};
	const line = byType[type];
	return [...(line ? [line] : []), '답변은 고객에게 이메일로 전달되고, MYR 마이 › 내 문의에서도 볼 수 있어요'];
}

/** [답변 등록하기] — 빈 칸 · 2000자 넘으면 못 누름. 답변은 한 번 등록하면 고치지 않는다(2026-11-05 대표 결정) */
export const canAnswer = (draft: string) => {
	const t = draft.trim();
	return !!t && t.length <= 2000;
};
