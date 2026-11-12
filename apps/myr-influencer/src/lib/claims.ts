/** CS 관리 › 교환 · 환불(7번 · 0078) — 탭 · 칩 색 · 답변 기한 · 승인 버튼 · 메시지 템플릿 · 처리 내역 줄.
 *  판정(선택지 · 단계 · 차감)은 DB 가 정한 값(claim JSON)을 그대로 쓰고, 이름 · 문구는 `@sellery/myr-core/claim-rules` 를 쓴다. 여기는 콘솔 화면 모양만.
 *  순수 — $app · $env 를 import 하지 않는다(src/test/claims.test.ts). */
import { claimTimeline, resolutionOption, type Claim, type ClaimKind, type ClaimQuotes, type ClaimStatus, type Resolution } from '@sellery/myr-core/claim-rules';
import { orderShipping, type OrderShipping } from './order-ship';
import { relativeTime } from './product-row';

/** 칩 색은 Tailwind 클래스로 (app.css 토큰 accent · lilac · mint) — 시안 그대로 */
export const CS_TYPE_META: Record<ClaimKind, { label: string; cls: string }> = {
	refund: { label: '환불', cls: 'bg-accent/16 text-accent' },
	exchange: { label: '교환', cls: 'bg-lilac/18 text-lilac' }
};
export const CS_STATUS_META: Record<ClaimStatus, { label: string; cls: string }> = {
	pending: { label: '처리 대기', cls: 'bg-white/8 text-white/85' },
	progress: { label: '진행 중', cls: 'bg-mint/16 text-mint' },
	done: { label: '완료', cls: 'bg-white/6 text-white/50' },
	rejected: { label: '반려', cls: 'bg-white/6 text-white/50' }
};

export type CsTab = 'pending' | 'progress' | 'done' | 'all';
const TAB_MATCH: Record<CsTab, (c: Pick<Claim, 'status'>) => boolean> = {
	pending: (c) => c.status === 'pending',
	progress: (c) => c.status === 'progress',
	done: (c) => c.status === 'done' || c.status === 'rejected',
	all: () => true
};
export const CS_TABS: { id: CsTab; name: string }[] = [
	{ id: 'pending', name: '대기' },
	{ id: 'progress', name: '진행 중' },
	{ id: 'done', name: '완료' },
	{ id: 'all', name: '전체' }
];
export const filterClaims = <T extends Pick<Claim, 'status'>>(list: T[], tab: CsTab): T[] => list.filter(TAB_MATCH[tab]);
export const claimTabCounts = (list: Pick<Claim, 'status'>[]) => CS_TABS.map((t) => ({ ...t, count: filterClaims(list, t.id).length }));

/** 답변 기한 — 접수 뒤 2일(시안 "오늘 안에 답변" · "2일 안에 답변"). 운영 정책이 정해지면 숫자만 바꾼다 */
export const ANSWER_DAYS = 2;
const DAY = 86_400_000;
/** 남은 날(오늘 안 = 1 · 넘기면 0) */
export function dueDays(c: Pick<Claim, 'createdAt'>, now: Date = new Date()): number {
	const t = new Date(c.createdAt).getTime();
	if (!Number.isFinite(t)) return ANSWER_DAYS;
	return Math.max(0, Math.ceil((t + ANSWER_DAYS * DAY - now.getTime()) / DAY));
}
export const dueText = (c: Pick<Claim, 'createdAt'>, now?: Date): string => {
	const d = dueDays(c, now);
	return d === 0 ? '답변 기한이 지났어요' : d <= 1 ? '오늘 안에 답변해주세요' : `${d}일 안에 답변`;
};
/** 목록 카드 강조 테두리 — 기한이 하루 이하 남은 처리 대기 요청만 */
export const isUrgentPending = (c: Pick<Claim, 'status' | 'createdAt'>, now?: Date): boolean => c.status === 'pending' && dueDays(c, now) <= 1;

/** 처리 방법 선택지 — DB options 순서 그대로 · 이름은 요청 종류에 따라(claim-rules) · 금액은 서버 예상 금액(claimQuotes · 없으면 금액 없이) */
export const resolutionOptions = (c: Claim, quotes: ClaimQuotes = {}) =>
	c.options.map((r) => resolutionOption(r, c, r === 'refund' ? quotes.refund : r === 'partial' ? quotes.partial : null));
export function approveLabel(c: Claim, resolution: Resolution | null): string {
	return resolution && c.options.includes(resolution) ? `${resolutionOption(resolution, c).title} 승인` : '처리 방법을 선택하세요';
}

/** 승인 · 반려 전 한 번 더 확인(공구 종료 · 판매 종료와 같은 방식) — 둘 다 고객 메일이 바로 나가고 되돌릴 수 없다(서버는 처리 대기 요청만 받는다 · NOT_PENDING).
 *  승인은 처리 방법을 골랐을 때만(선택지 밖이면 null) · 문구는 되돌릴 수 없다는 안내 한 줄(처리 방법 · 금액은 바로 위 선택지에 있다) */
export type DecideConfirm = { text: string; button: string };
export function decideConfirm(c: Pick<Claim, 'options'>, decision: 'approve' | 'reject', resolution: Resolution | null): DecideConfirm | null {
	if (decision === 'reject') return { text: '반려하면 고객에게 반려 메일이 바로 가고, 되돌릴 수 없어요', button: '정말 반려하기' };
	if (!resolution || !c.options.includes(resolution)) return null;
	return { text: '승인하면 고객에게 메일이 바로 가고, 되돌릴 수 없어요', button: '정말 승인하기' };
}

/** 고객에게 보낼 메시지 칩 — 고른 처리 방법에 맞는 문구 + 반려 안내. 크리에이터 이름을 넣지 않는다(메일에 크리에이터 이름이 붙는다) */
export const REPLY_TEMPLATES: Record<Resolution | 'reject', string> = {
	refund: '불편을 드려 죄송해요. 환불을 승인했어요. 회수가 필요하면 택배 기사가 방문하고, 확인 뒤 결제수단으로 돌려드릴게요.',
	partial: '미개봉 확인 뒤 왕복 배송비를 뺀 금액으로 환불해드릴게요. 택배 기사가 회수하러 방문해요.',
	reship: '사진 확인했어요. 새 제품을 보내드릴게요. 받으신 제품은 폐기하셔도 괜찮아요.',
	reship_collect: '잘못 보내드려 죄송해요. 새 제품을 보내드리고, 받으신 제품은 택배 기사가 회수하러 방문해요.',
	reject: '확인해봤는데 이번 요청은 처리하기 어려워요. 자세한 내용은 주문 상세의 [문의]로 남겨주세요.'
};
export function replyChips(resolution: Resolution | null): { name: string; text: string }[] {
	const chips: { name: string; text: string }[] = [];
	if (resolution) chips.push({ name: resolution === 'reship' || resolution === 'reship_collect' ? '재발송 안내' : '환불 안내', text: REPLY_TEMPLATES[resolution] });
	chips.push({ name: '반려 안내', text: REPLY_TEMPLATES.reject });
	return chips;
}

/** 처리 내역 줄 — 실제 기록(claimTimeline) + 콘솔 표기(상대 시각 · 승인/반려한 사람은 메시지로 대신) */
export function consoleTimeline(c: Claim, now?: Date): { title: string; when: string; done: boolean; last: boolean }[] {
	const rows = claimTimeline(c);
	return rows.map((r, i) => ({
		title: r.title,
		when: [r.at ? relativeTime(r.at, now) : r.done ? '' : '대기 중', r.detail].filter(Boolean).join(' · '),
		done: r.done,
		last: i === rows.length - 1
	}));
}

/** 주문 · 배송 — 문의 상세와 같은 표(요청이 걸린 줄의 배송 상태 · 송장 · 발송일 · 배송 완료일 · 0080) */
/** 그 줄 주문 수량 전체의 상품 금액 — 요청 상세 제품 카드 · "주문 · 배송" 상품 금액(요청 수량 금액은 처리 방법 · 처리 결과). 서버 값 그대로(0099 · 줄 amount) */
export const claimOrderedAmount = (c: Pick<Claim, 'order'>): number => c.order.item.amount;
/** 요청 상세 "주문 · 배송" — 그 줄 송장 · 상품 금액(그 줄 전체 수량) · 주문 배송비(0090) */
export const claimShipping = (c: Pick<Claim, 'order'>): OrderShipping =>
	orderShipping({ ...c.order, money: c.order.shippingFee === null ? null : { goods: claimOrderedAmount(c), shippingFee: c.order.shippingFee } });

/** 지금 단계 — 진행 중 요청에서 크리에이터가 볼 한 줄(실행은 운영 · 서버) */
export const STEP_TEXT: Record<string, string> = {
	collect: 'MYR 운영팀이 회수를 접수해요 — 회수 확인 뒤 다음 단계로',
	refund: '환불을 진행하고 있어요',
	reship: 'MYR 물류센터에서 새 제품을 보낼 준비를 해요'
};
