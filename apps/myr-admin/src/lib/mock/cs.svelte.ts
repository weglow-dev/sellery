/** CS 관리 서버 흉내 — 교환 · 환불 요청(docs §8) · 고객 문의(§7-1). UI 단계라 판정 · 문구 · 버튼 목록을 여기서 대신한다(메모리 · 새로고침하면 시드로).
 *  화면(routes/cs/**)은 여기서 받은 칩 · 안내 · 버튼 · 건수 · 빈 상태 문구만 그린다 — 화면에서 상태를 다시 판정하지 않는다.
 *  시드는 시안 "MYR Admin PC" seed() 의 claims · inquiries 를 seed.ts 크리에이터 · catalog.ts 상품에 맞추고 날짜를 +5일(NOW = 11월 17일(화) 오전 10:20) 옮긴 것 */
import { creatorOf, productOf } from './catalog';
import { ME, NOW } from './seed';
import type { Chip, LogEntry, Tone } from './types';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const stamp = () => `11월 17일 ${NOW.time}`;
const me = () => `${ME.role} ${ME.name}`;

// ───────── 교환 · 환불 ─────────

/** 지금 단계 — 처리 대기(승인 · 반려 전) · 회수 확인 필요 · 재발송 예약(resend — 이벗이 다음 영업일 11시에 자동 발송) · 환불 실패 · 완료 · 반려 */
export type ClaimStage = 'pending' | 'pickup' | 'resend' | 'refund' | 'done' | 'rejected';
export type ClaimKind = '환불' | '교환';
/** 처리 방법 — 서버 이름 그대로(@sellery/myr-core claim-rules Resolution · 0078) */
export type Resolution = 'refund' | 'partial' | 'reship' | 'reship_collect';
/** 처리 방법 선택지 하나(서버 응답 모양) — quote = 실제로 돌려줄 금액(환불이 없으면 null) */
export interface ClaimOpt {
	id: Resolution;
	title: string;
	desc: string;
	collects: boolean;
	refunds: boolean;
	quote: number | null;
}
const op = (id: Resolution, title: string, desc: string, collects: boolean, refunds: boolean, quote: number | null = null): ClaimOpt => ({ id, title, desc, collects, refunds, quote });
/** 교환 · 환불 목록 탭(시안 2026-11-27) — exchanges 교환(진행 중) · refunds 환불(진행 중 · 환불 실패 포함) · collect 회수 확인 필요(회수 운송장 나옴) · done 완료 · all 전체.
 *  처리 대기 · 반려 요청은 이 목록에 없고 고객 문의의 [교환 · 환불] · [답변 완료] 탭에서 본다 */
export type ClaimTab = 'exchanges' | 'refunds' | 'collect' | 'done' | 'all';

export interface ClaimRaw {
	id: string;
	ord: string;
	creatorId: string;
	productId: string;
	qty: number;
	kind: ClaimKind;
	/** 사유 — 서버 값 그대로: 단순 변심 · 파손 · 누액 · 오배송 */
	why: string;
	stage: ClaimStage;
	/** 승인한 처리 방법(승인 전 null) */
	res: Resolution | null;
	/** 처리 방법 선택지 — 서버 응답 그대로(myr_refund_request_options 순서 · 이름 · 설명 · 회수 필요 myr_claim_resolution_collects · 환불 myr_claim_resolution_refunds · 돌려줄 금액 refundQuote).
	 *  목은 판정하지 않고 이 값만 읽는다(check-boundaries (h)) */
	opts: ClaimOpt[];
	/** 접수일 */
	at: string;
	/** 고객(가림) */
	who: string;
	/** 크리에이터 답변 기한(2일) · 지난 날 — 처리 대기에만 뜻이 있다 */
	due: string;
	late: number;
	/** 승인 · 반려한 날 · 사람(크리에이터 이름 또는 운영) */
	okAt: string | null;
	by: string | null;
	text: string;
	photos: number;
	msg: string | null;
	/** 환불 실패 — 실패 원문 */
	fail: string | null;
	/** 재발송 운송장(이벗 교환 주문이면 18시 수집 · 이벗이 아닌 곳에서 보낸 예외면 운영이 직접 입력) — 완료 뒤 주문 · 배송 칸에 보인다 */
	resent: string | null;
	/** 이벗 회수(승인 때 자동 신청 — E4 · 바인허브 exprtakeback): 신청됨(운송장 대기) · 운송장 나옴 · 신청 실패 */
	/* 이벗 처리 단계(2026-11-26 — 바인허브처럼 도착은 운영이 확인): requested 회수 접수(운송장 대기) → assigned 회수 운송장 나옴(매일 10시 자동) → 운영이 택배 조회로 회수가 끝난 걸 확인하고 [회수 완료(운영 확인)] · failed 신청 실패 */
	pickup: { state: 'requested' | 'assigned' | 'failed'; at: string; code?: string; carrier?: string; tracking?: string; assignedAt?: string; doneAt?: string; fail?: string } | null;
	/** 교환 발송(회수 확인 때 자동 — 결제 없는 교환 주문 줄 → 다음 영업일 11시 이벗 교환 주문 ordGbn=2 · 18시 송장 수집 · 바인허브와 같음)
	 *  queued = 발주 예약 · ordered = 이벗에 등록(배송준비중 · 재발송 운송장 대기) · shipped = 재발송 운송장 붙음(배송 중) — 택배사 배송 완료('91') 또는 발송 10일이면 교환 완료(stage done · 2026-11-26) */
	reship: { state: 'queued' | 'ordered' | 'shipped' | 'delivered'; reqAt: string; at: string; code?: string; carrier?: string; tracking?: string; shippedAt?: string; deliveredAt?: string } | null;
	/** 처리 대기 48시간 넘음 칩에 붙일 지난 시간(서버 값 자리) */
	ago?: string;
	tl: LogEntry[];
}

export interface ClaimRow {
	id: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	meta: string;
	title: string;
	sub: string;
	right: string;
	rightSub: string;
	rightSubTone: Tone;
	href: string;
}

/** 되돌릴 수 없는 한 번 더 확인 버튼(ArmedButton) 문구 */
export interface Armed {
	label: string;
	sure: string;
	note: string;
}

export interface ClaimView {
	id: string;
	stage: ClaimStage;
	/** 뒤로가기(주소에 온 곳이 없을 때) — 처리 대기 · 반려는 고객 문의, 나머지는 교환 · 환불의 요청이 속한 탭 */
	back: { href: string; label: string };
	title: string;
	thumb: { tile: string; icon: string };
	request: { chip: Chip; text: string };
	photos: { label: string; bg: string }[];
	photosTitle: string;
	message: { title: string; text: string } | null;
	order: { k: string; v: string }[];
	timeline: LogEntry[];
	stageChip: Chip | null;
	side: { k: string; v: string; tone: Tone | 'plain'; href?: string }[];
	/** 물류 대행사 처리 칸(시안) — 단계 한 줄씩(도달한 단계는 시각 · 지금 단계 주황 점 · 실패 빨강) + 회수 접수 코드 · 운송장. 회수 없는 바로 환불 · 승인 전 · 반려는 null */
	logi: { chip: Chip; steps: { label: string; at: string; state: 'done' | 'now' | 'todo' | 'fail' }[]; rows: { k: string; v: string; tone: Tone | 'plain' }[] } | null;
	/** 안내 — 한 줄(text) 또는 점 목록(lines) */
	notes: { tone: 'orange' | 'red' | 'grey'; text?: string; lines?: string[] }[];
	/** 단계별 버튼 — pickup 회수 완료(+ 택배 조회) · retry 회수 다시 신청 · refund 환불 다시 · decide 반려/승인 */
	action: 'pickup' | 'retry' | 'refund' | 'decide' | null;
	armed: Armed | null;
	trackToast: string;
}

export interface ClaimModal {
	title: string;
	desc: string;
	info: string;
	ok: string;
	sure?: string;
	/** 두 번째 확인 문구 — 처리 방법마다(승인) · 하나(반려) */
	sureInfo?: Record<string, string>;
	/** 고르기 — 처리 방법(서버 선택지를 시안 이름 환불 · 반품 · 재발송 · 회수 후 재발송으로) */
	options?: { label: string; items: { id: string; title: string }[]; value: string; hint: string };
	msg?: { label: string; ph: string; max: number; required: boolean };
}

export const CARRIERS = ['CJ대한통운', '한진택배', '롯데택배', '우체국택배'];

const STAGE_CHIP: Record<ClaimStage, Chip> = {
	pending: { label: '처리 대기', tone: 'orange' },
	pickup: { label: '회수 확인 필요', tone: 'orange' },
	resend: { label: '자동 발송', tone: 'mint' },
	refund: { label: '환불 실패', tone: 'red' },
	done: { label: '완료', tone: 'grey' },
	rejected: { label: '반려', tone: 'grey' }
};
const CLAIM_EMPTY: Record<ClaimTab, string> = {
	exchanges: '진행 중인 교환이 없어요',
	refunds: '진행 중인 환불이 없어요',
	collect: '회수 확인을 기다리는 요청이 없어요',
	done: '완료한 요청이 없어요',
	all: '교환 · 환불 요청이 없어요'
};
const PHOTO_BG = ['linear-gradient(145deg,#3a3d47,#22242b)', 'linear-gradient(145deg,#4a4038,#26221f)', 'linear-gradient(145deg,#35424a,#1f2529)'];
const PROXY_NOTE = '운영이 대신 처리해요 — 고객 메일은 크리에이터가 처리할 때와 같아요';
const L = (at: string, text: string, who: string): LogEntry => ({
	at,
	text,
	who
});
const K = (id: string, ord: string, creatorId: string, productId: string, qty: number, kind: ClaimKind, why: string, stage: ClaimStage, at: string, who: string, x: Partial<ClaimRaw>): ClaimRaw => ({
	id,
	ord,
	creatorId,
	productId,
	qty,
	kind,
	why,
	stage,
	at,
	who,
	res: null,
	opts: [],
	due: '',
	late: 0,
	okAt: null,
	by: null,
	text: '',
	photos: 0,
	msg: null,
	fail: null,
	resent: null,
	pickup: null,
	reship: null,
	tl: [],
	...x
});

const seedClaims = (): ClaimRaw[] => [
	K('R-0312', 'MYR1509', 'c1', 'p1', 1, '환불', '단순 변심', 'pending', '11월 14일', '김*연', {
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩26,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 26000), op('refund', '전액 환불', '₩32,000 환불 · 회수 확인 뒤 환불', true, true, 32000)],
		due: '11월 16일',
		late: 1,
		ago: '72시간 전',
		text: '생각했던 맛과 달라서 환불하고 싶어요. 한 포만 뜯었어요.',
		photos: 2,
		tl: [L('11월 14일 오전 10:22', '고객이 환불을 요청했어요', '고객'), L('11월 16일 오전 10:22', '크리에이터 답변 기한이 지났어요', '자동')]
	}),
	K('R-0314', 'MYR1512', 'c1', 'p2', 2, '교환', '파손 · 누액', 'pending', '11월 16일', '박*훈', {
		opts: [op('reship', '새 제품 재발송', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false), op('refund', '환불로 전환', '₩72,000 환불 · 회수 없이 바로 환불', false, true, 72000)],
		due: '11월 18일',
		text: '박스가 찌그러져서 왔고 스틱 두 포가 터져 있었어요.',
		photos: 3,
		tl: [L('11월 16일 오후 3:40', '고객이 교환을 요청했어요', '고객')]
	}),
	K('R-0309', 'MYR1502', 'c2', 'p5', 1, '환불', '단순 변심', 'pickup', '11월 12일', '신*영', {
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩22,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 22000), op('refund', '전액 환불', '₩28,000 환불 · 회수 확인 뒤 환불', true, true, 28000)],
		res: 'partial',
		okAt: '11월 13일',
		by: '하루',
		text: '생각보다 양이 많아서 뜯지 않은 채로 돌려보낼게요.',
		photos: 2,
		msg: '회수 후 왕복 배송비를 빼고 환불해 드릴게요.',
		pickup: { state: 'assigned', at: '11월 13일 오전 9:30', code: 'RP2611130042', carrier: 'CJ대한통운', tracking: '6011-2045-7731', assignedAt: '11월 14일 오전 10:00' },
		tl: [L('11월 12일 오후 1:05', '고객이 환불을 요청했어요', '고객'), L('11월 13일 오전 9:30', '하루가 승인했어요 · 이벗 회수 신청', '크리에이터'), L('11월 14일 오전 10:00', '회수 운송장 · CJ대한통운 6011-2045-7731', '자동')]
	}),
	K('R-0311', 'MYR1506', 'c2', 'p6', 1, '교환', '오배송', 'pickup', '11월 15일', '오*진', {
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩26,000 환불 · 회수 확인 뒤 환불', true, true, 26000)],
		okAt: '11월 16일',
		by: '하루',
		res: 'reship_collect',
		text: '굿나잇 구미를 주문했는데 다른 상품이 왔어요.',
		msg: '회수 후 바로 바꿔 드릴게요.',
		pickup: { state: 'requested', at: '11월 16일 오후 4:12', code: 'RP2611160118' },
		tl: [L('11월 15일 오후 8:40', '고객이 교환을 요청했어요', '고객'), L('11월 16일 오후 4:12', '하루가 승인했어요 · 이벗 회수 신청', '크리에이터')]
	}),
	K('R-0310', 'MYR1504', 'c4', 'p10', 1, '환불', '단순 변심', 'pickup', '11월 14일', '윤*아', {
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩28,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 28000), op('refund', '전액 환불', '₩34,000 환불 · 회수 확인 뒤 환불', true, true, 34000)],
		okAt: '11월 16일',
		by: '소이',
		res: 'partial',
		text: '피부에 맞지 않아서 개봉 전 상태로 돌려보낼게요.',
		msg: '회수 후 환불해 드릴게요.',
		pickup: { state: 'failed', at: '11월 16일 오전 10:05', fail: '이벗 회수 신청 실패 · 송장 번호를 찾을 수 없어요' },
		tl: [L('11월 14일 오후 2:30', '고객이 환불을 요청했어요', '고객'), L('11월 16일 오전 10:05', '소이가 승인했어요', '크리에이터'), L('11월 16일 오전 10:05', '이벗 회수 신청 실패 · 송장 번호를 찾을 수 없어요', '자동')]
	}),
	K('R-0307', 'MYR1495', 'c3', 'p7', 1, '교환', '오배송', 'resend', '11월 11일', '고*민', {
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩39,000 환불 · 회수 확인 뒤 환불', true, true, 39000)],
		okAt: '11월 12일',
		by: '준',
		res: 'reship_collect',
		text: '바닐라를 주문했는데 초코가 왔어요.',
		photos: 1,
		msg: '바로 바닐라로 다시 보내 드릴게요.',
		pickup: { state: 'assigned', at: '11월 12일 오후 2:10', code: 'RP2611120077', carrier: '롯데택배', tracking: '2391-8854-0012', assignedAt: '11월 13일 오전 10:00', doneAt: '11월 16일 오후 4:05' },
		reship: { state: 'queued', reqAt: '11월 16일 오후 4:05', at: '11월 18일(수) 오전 11시' },
		tl: [L('11월 11일 오전 11:48', '고객이 교환을 요청했어요', '고객'), L('11월 12일 오후 2:10', '준이 승인했어요 · 이벗 회수 신청', '크리에이터'), L('11월 13일 오전 10:00', '회수 운송장 · 롯데택배 2391-8854-0012', '자동'), L('11월 16일 오후 4:05', '회수 확인 · 재발송 예약', me())]
	}),
	K('R-0306', 'MYR1493', 'c1', 'p2', 1, '교환', '파손 · 누액', 'resend', '11월 11일', '정*우', {
		opts: [op('reship', '새 제품 재발송', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false), op('refund', '환불로 전환', '₩36,000 환불 · 회수 없이 바로 환불', false, true, 36000)],
		res: 'reship',
		okAt: '11월 13일',
		by: '민지',
		text: '스틱 한 포가 터져서 왔어요.',
		photos: 1,
		msg: '새 상품으로 바로 보내 드릴게요.',
		reship: { state: 'shipped', reqAt: '11월 13일 오후 3:40', at: '11월 16일 오전 11:00', code: 'EX2611160211', carrier: 'CJ대한통운', tracking: '5612-3455-2081', shippedAt: '11월 16일 오후 6:00' },
		tl: [
			L('11월 11일 오후 7:15', '고객이 교환을 요청했어요', '고객'),
			L('11월 13일 오후 3:40', '민지가 승인했어요 · 새 제품 재발송 · 재발송 예약', '크리에이터'),
			L('11월 16일 오전 11:00', '이벗 교환 주문 등록 · 배송준비중', '자동'),
			L('11월 16일 오후 6:00', '재발송 운송장 · CJ대한통운 5612-3455-2081 · 고객에게 알림', '자동')
		]
	}),
	K('R-0303', 'MYR1486', 'c3', 'p7', 1, '교환', '오배송', 'done', '11월 8일', '권*린', {
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩39,000 환불 · 회수 확인 뒤 환불', true, true, 39000)],
		okAt: '11월 8일',
		by: '준',
		res: 'reship_collect',
		text: '초코를 주문했는데 바닐라가 왔어요.',
		msg: '초코로 다시 보내 드릴게요.',
		pickup: { state: 'assigned', at: '11월 8일 오후 4:20', code: 'RP2611080033', carrier: '롯데택배', tracking: '2391-8701-3355', assignedAt: '11월 9일 오전 10:00', doneAt: '11월 11일 오후 2:00' },
		reship: { state: 'delivered', reqAt: '11월 11일 오후 2:00', at: '11월 12일 오전 11:00', code: 'EX2611120166', carrier: 'CJ대한통운', tracking: '5612-3402-1187', shippedAt: '11월 12일 오후 6:00', deliveredAt: '11월 14일 오후 6:00' },
		tl: [
			L('11월 8일 오전 10:05', '고객이 교환을 요청했어요', '고객'),
			L('11월 8일 오후 4:20', '준이 승인했어요 · 이벗 회수 신청', '크리에이터'),
			L('11월 9일 오전 10:00', '회수 운송장 · 롯데택배 2391-8701-3355', '자동'),
			L('11월 11일 오후 2:00', '회수 확인 · 재발송 예약', '운영 박서연'),
			L('11월 12일 오전 11:00', '이벗 교환 주문 등록 · 배송준비중', '자동'),
			L('11월 12일 오후 6:00', '재발송 운송장 · CJ대한통운 5612-3402-1187 · 고객에게 알림', '자동'),
			L('11월 14일 오후 6:00', '배송 완료 · 택배사 연동 · 교환 완료', '자동')
		]
	}),
	K('R-0305', 'MYR1490', 'c4', 'p9', 2, '환불', '파손 · 누액', 'refund', '11월 10일', '임*정', {
		opts: [op('refund', '전액 환불', '₩48,000 환불 · 회수 없이 바로 환불', false, true, 48000), op('reship', '교환으로 전환', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false)],
		res: 'refund',
		okAt: '11월 11일',
		by: '소이',
		text: '캡슐이 녹아서 서로 붙어 있어요.',
		photos: 2,
		msg: '죄송해요, 전액 환불해 드릴게요.',
		fail: '카드사 환불 실패 · 11월 16일 오후 2:11 (카드 유효기간 만료)',
		tl: [
			L('11월 10일 오후 5:20', '고객이 환불을 요청했어요', '고객'),
			L('11월 11일 오전 10:15', '소이가 승인했어요 · 전액 환불(회수 없이)', '크리에이터'),
			L('11월 16일 오후 2:11', '환불 실패 · 카드 유효기간 만료', '자동')
		]
	}),
	K('R-0301', 'MYR1482', 'c5', 'p13', 1, '환불', '단순 변심', 'done', '11월 7일', '차*우', {
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩21,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 21000), op('refund', '전액 환불', '₩27,000 환불 · 회수 확인 뒤 환불', true, true, 27000)],
		okAt: '11월 8일',
		by: '온유',
		res: 'refund',
		pickup: { state: 'assigned', at: '11월 8일 오전 11:10', code: 'RP2611080029', carrier: 'CJ대한통운', tracking: '6011-1950-3307', assignedAt: '11월 9일 오전 10:00', doneAt: '11월 11일 오후 3:20' },
		text: '선물용으로 샀는데 필요 없어졌어요.',
		msg: '회수 후 환불해 드릴게요.',
		tl: [L('11월 7일 오후 2:30', '고객이 환불을 요청했어요', '고객'), L('11월 8일 오전 11:10', '온유가 승인했어요', '크리에이터'), L('11월 11일 오후 3:20', '회수 확인 · 환불 완료 ₩27,000', '운영 박서연')]
	}),
	K('R-0298', 'MYR1476', 'c6', 'p14', 1, '환불', '단순 변심', 'rejected', '11월 5일', '남*희', {
		okAt: '11월 6일',
		by: '리나',
		text: '반 이상 먹었는데 효과가 없어요.',
		msg: '절반 이상 드신 상품은 환불이 어려워요. 양해 부탁드려요.',
		tl: [L('11월 5일 오후 6:12', '고객이 환불을 요청했어요', '고객'), L('11월 6일 오전 10:40', '리나가 반려했어요', '크리에이터')]
	}),

	// ── 케이스 모음(2026-11-26) — 처리 방법 · 단계 조합을 하나씩 볼 수 있게
	// 처리 대기: 교환 · 오배송(재발송 + 회수 / 환불로 전환)
	K('R-0318', 'MYR1540', 'c5', 'p12', 1, '교환', '오배송', 'pending', '11월 17일', '하*준', {
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩30,000 환불 · 회수 확인 뒤 환불', true, true, 30000)],
		due: '11월 19일',
		text: '유산균 파우더를 시켰는데 곡물 스틱이 왔어요.',
		photos: 2,
		tl: [L('11월 17일 오전 8:52', '고객이 교환을 요청했어요', '고객')]
	}),
	// 처리 대기: 환불 · 파손 · 누액(회수 없이 전액 환불 / 교환으로 전환)
	K('R-0317', 'MYR1538', 'c6', 'p14', 1, '환불', '파손 · 누액', 'pending', '11월 16일', '서*아', {
		opts: [op('refund', '전액 환불', '₩29,000 환불 · 회수 없이 바로 환불', false, true, 29000), op('reship', '교환으로 전환', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false)],
		due: '11월 18일',
		text: '젤리 포장이 터져서 내용물이 새어 나왔어요.',
		photos: 3,
		tl: [L('11월 16일 오후 9:05', '고객이 환불을 요청했어요', '고객')]
	}),
	// 처리 대기: 환불 · 오배송(회수 확인 뒤 전액 환불 / 교환으로 전환)
	K('R-0316', 'MYR1536', 'c4', 'p9', 1, '환불', '오배송', 'pending', '11월 15일', '조*원', {
		opts: [op('refund', '전액 환불', '₩24,000 환불 · 회수 확인 뒤 환불', true, true, 24000), op('reship_collect', '교환으로 전환', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false)],
		due: '11월 17일',
		text: '비오틴 캡슐 대신 다른 제품이 왔어요. 환불해 주세요.',
		photos: 1,
		tl: [L('11월 15일 오전 11:30', '고객이 환불을 요청했어요', '고객')]
	}),
	// 회수 신청 실패 — 이벗 연결 오류(응답 시간 초과) · [회수 다시 신청]
	K('R-0315', 'MYR1532', 'c12', 'p26', 1, '환불', '단순 변심', 'pickup', '11월 14일', '임*은', {
		res: 'partial',
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩16,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 16000), op('refund', '전액 환불', '₩22,000 환불 · 회수 확인 뒤 환불', true, true, 22000)],
		okAt: '11월 17일',
		by: '지유',
		text: '선물 받은 것과 겹쳐서 뜯지 않은 채로 돌려보낼게요.',
		msg: '회수 후 왕복 배송비를 빼고 환불해 드릴게요.',
		pickup: { state: 'failed', at: '11월 17일 오전 9:12', fail: '이벗 연결 실패 · 응답 시간 초과(30초)' },
		tl: [L('11월 14일 오후 10:05', '고객이 환불을 요청했어요', '고객'), L('11월 17일 오전 9:12', '지유가 승인했어요 · 부분 환불', '크리에이터'), L('11월 17일 오전 9:12', '이벗 회수 신청 실패 · 응답 시간 초과', '자동')]
	}),
	// 회수 신청 실패 · 교환 탭: 오배송 교환(재발송 + 회수) — 이벗이 회수를 접수하지 못함 → [회수 다시 신청]
	K('R-0320', 'MYR1535', 'c6', 'p14', 1, '교환', '오배송', 'pickup', '11월 16일', '노*린', {
		res: 'reship_collect',
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩29,000 환불 · 회수 확인 뒤 환불', true, true, 29000)],
		okAt: '11월 17일',
		by: '리나',
		text: '마그네슘 젤리를 시켰는데 무드 허브티가 왔어요.',
		photos: 2,
		msg: '회수 후 마그네슘 젤리로 다시 보내 드릴게요.',
		pickup: { state: 'failed', at: '11월 17일 오전 8:30', fail: '이벗 회수 신청 실패 · 이벗 일시 오류(잠시 후 다시 시도)' },
		tl: [L('11월 16일 오후 7:50', '고객이 교환을 요청했어요', '고객'), L('11월 17일 오전 8:30', '리나가 승인했어요 · 재발송 + 회수', '크리에이터'), L('11월 17일 오전 8:30', '이벗 회수 신청 실패 · 이벗 일시 오류', '자동')]
	}),
	// 회수 운송장 나옴(회수 확인 필요) · 환불 탭: 교환 요청을 "환불로 전환"(첫 칩은 회수 후 환불)
	K('R-0313', 'MYR1530', 'c1', 'p3', 1, '교환', '오배송', 'pickup', '11월 13일', '배*진', {
		res: 'refund',
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩34,000 환불 · 회수 확인 뒤 환불', true, true, 34000)],
		okAt: '11월 14일',
		by: '민지',
		text: '히알루론 젤리 대신 포도 젤리가 왔어요.',
		photos: 1,
		msg: '재고가 없어 환불로 처리해 드릴게요. 회수 후 바로 환불돼요.',
		pickup: { state: 'assigned', at: '11월 14일 오전 10:10', code: 'RP2611140051', carrier: 'CJ대한통운', tracking: '6011-2101-5584', assignedAt: '11월 15일 오전 10:00' },
		tl: [L('11월 13일 오후 6:40', '고객이 교환을 요청했어요', '고객'), L('11월 14일 오전 10:10', '민지가 승인했어요 · 환불로 전환 · 이벗 회수 신청', '크리에이터'), L('11월 15일 오전 10:00', '회수 운송장 · CJ대한통운 6011-2101-5584', '자동')]
	}),
	// 회수 운송장 나옴(회수 확인 필요) · 교환 탭: 환불 요청을 "교환으로 전환"
	K('R-0308', 'MYR1501', 'c8', 'p17', 1, '환불', '오배송', 'pickup', '11월 13일', '문*아', {
		res: 'reship_collect',
		opts: [op('refund', '전액 환불', '₩29,000 환불 · 회수 확인 뒤 환불', true, true, 29000), op('reship_collect', '교환으로 전환', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false)],
		okAt: '11월 16일',
		by: '다온',
		text: '토마토 스틱을 시켰는데 흑마늘 젤리가 왔어요.',
		photos: 2,
		msg: '토마토 스틱으로 다시 보내 드릴게요.',
		pickup: { state: 'assigned', at: '11월 13일 오후 4:00', code: 'RP2611130088', carrier: '롯데택배', tracking: '2391-8920-4471', assignedAt: '11월 14일 오전 10:00' },
		tl: [L('11월 13일 오후 1:15', '고객이 환불을 요청했어요', '고객'), L('11월 13일 오후 4:00', '다온이 승인했어요 · 교환으로 전환 · 이벗 회수 신청', '크리에이터'), L('11월 14일 오전 10:00', '회수 운송장 · 롯데택배 2391-8920-4471', '자동')]
	}),
	// 재발송 · 자동 발송: 환불 요청을 "교환으로 전환"(파손 · 누액 · 회수 없음) — 승인 때 바로 들어옴
	K('R-0304', 'MYR1489', 'c5', 'p13', 1, '환불', '파손 · 누액', 'resend', '11월 15일', '김*호', {
		res: 'reship',
		opts: [op('refund', '전액 환불', '₩27,000 환불 · 회수 없이 바로 환불', false, true, 27000), op('reship', '교환으로 전환', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false)],
		okAt: '11월 17일',
		by: '온유',
		text: '스틱 몇 개가 눌려서 가루가 새어 나왔어요.',
		photos: 2,
		msg: '새 제품으로 바로 보내 드릴게요.',
		reship: { state: 'ordered', reqAt: '11월 17일 오전 9:05', at: '11월 17일 오전 11:00', code: 'EX2611170219' },
		tl: [L('11월 15일 오후 4:20', '고객이 환불을 요청했어요', '고객'), L('11월 17일 오전 9:05', '온유가 승인했어요 · 교환으로 전환 · 재발송 예약', '크리에이터')]
	}),
	// 환불할 차례: 부분 환불이 회수 확인 뒤 실패
	K('R-0296', 'MYR1472', 'c9', 'p20', 1, '환불', '단순 변심', 'refund', '11월 6일', '유*빈', {
		res: 'partial',
		opts: [op('partial', '부분 환불 (왕복 배송비 차감)', '₩32,000 환불 · 회수 확인 뒤 환불 · 왕복 배송비 ₩6,000 차감', true, true, 32000), op('refund', '전액 환불', '₩38,000 환불 · 회수 확인 뒤 환불', true, true, 38000)],
		okAt: '11월 7일',
		by: '하늘',
		text: '맛이 입에 맞지 않아요. 뜯지 않은 상자 그대로 보낼게요.',
		msg: '회수 후 왕복 배송비를 빼고 환불해 드릴게요.',
		pickup: { state: 'assigned', at: '11월 7일 오전 11:00', code: 'RP2611070019', carrier: '한진택배', tracking: '4410-3388-1290', assignedAt: '11월 8일 오전 10:00', doneAt: '11월 15일 오전 9:30' },
		fail: '토스 부분 취소 실패 · 11월 15일 오전 9:40 (결제 취소 가능 금액 부족)',
		tl: [
			L('11월 6일 오후 3:00', '고객이 환불을 요청했어요', '고객'),
			L('11월 7일 오전 11:00', '하늘이 승인했어요 · 부분 환불 · 이벗 회수 신청', '크리에이터'),
			L('11월 8일 오전 10:00', '회수 운송장 · 한진택배 4410-3388-1290', '자동'),
			L('11월 15일 오전 9:30', '회수 확인', '운영 박서연'),
			L('11월 15일 오전 9:40', '환불 실패 · 결제 취소 가능 금액 부족', '자동')
		]
	}),
	// 완료: 회수 없이 바로 환불(파손 · 누액)
	K('R-0302', 'MYR1484', 'c2', 'p5', 2, '환불', '파손 · 누액', 'done', '11월 9일', '이*솔', {
		res: 'refund',
		opts: [op('refund', '전액 환불', '₩56,000 환불 · 회수 없이 바로 환불', false, true, 56000), op('reship', '교환으로 전환', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false)],
		okAt: '11월 9일',
		by: '하루',
		text: '필름 봉투가 찢어져서 왔어요.',
		photos: 2,
		msg: '죄송해요, 바로 환불해 드릴게요.',
		tl: [L('11월 9일 오전 9:12', '고객이 환불을 요청했어요', '고객'), L('11월 9일 오후 1:40', '하루가 승인했어요 · 전액 환불(회수 없이)', '크리에이터'), L('11월 9일 오후 1:50', '회수 없이 환불 완료 ₩56,000', '자동')]
	}),
	// 완료: 바로 재발송(파손 · 누액) — 이벗이 보내고 송장 자동
	K('R-0300', 'MYR1480', 'c1', 'p1', 1, '교환', '파손 · 누액', 'done', '11월 7일', '홍*림', {
		res: 'reship',
		opts: [op('reship', '새 제품 재발송', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false), op('refund', '환불로 전환', '₩32,000 환불 · 회수 없이 바로 환불', false, true, 32000)],
		okAt: '11월 8일',
		by: '민지',
		text: '젤리 한 포가 터져 있었어요.',
		photos: 1,
		msg: '새 제품으로 보내 드릴게요.',
		reship: { state: 'delivered', reqAt: '11월 8일 오전 9:20', at: '11월 9일 오전 11:00', code: 'EX2611090131', carrier: 'CJ대한통운', tracking: '5612-3377-0941', shippedAt: '11월 9일 오후 6:00', deliveredAt: '11월 11일 오후 6:00' },
		tl: [
			L('11월 7일 오후 8:30', '고객이 교환을 요청했어요', '고객'),
			L('11월 8일 오전 9:20', '민지가 승인했어요 · 새 제품 재발송 · 재발송 예약', '크리에이터'),
			L('11월 9일 오전 11:00', '이벗 교환 주문 등록 · 배송준비중', '자동'),
			L('11월 9일 오후 6:00', '재발송 운송장 · CJ대한통운 5612-3377-0941 · 고객에게 알림', '자동'),
			L('11월 11일 오후 6:00', '배송 완료 · 택배사 연동 · 교환 완료', '자동')
		]
	}),
	// 완료: 송장 직접 입력(예외 — 이벗이 아닌 곳에서 보냄)
	K('R-0299', 'MYR1478', 'c3', 'p7', 1, '교환', '오배송', 'done', '11월 6일', '송*우', {
		res: 'reship_collect',
		opts: [op('reship_collect', '재발송 + 회수', '잘못 간 제품을 회수해 확인한 뒤 새 제품 출고', true, false), op('refund', '환불로 전환', '₩39,000 환불 · 회수 확인 뒤 환불', true, true, 39000)],
		okAt: '11월 6일',
		by: '준',
		text: '초코 맛을 시켰는데 바닐라가 왔어요.',
		msg: '초코 맛으로 다시 보내 드릴게요.',
		pickup: { state: 'assigned', at: '11월 6일 오후 3:00', code: 'RP2611060008', carrier: '롯데택배', tracking: '2391-8650-7712', assignedAt: '11월 7일 오전 10:00', doneAt: '11월 9일 오후 2:30' },
		reship: { state: 'delivered', reqAt: '11월 9일 오후 2:30', at: '11월 10일 오전 11:00', code: 'EX2611100142', carrier: '우체국택배', tracking: '6896-1123-4410', shippedAt: '11월 10일 오후 6:00', deliveredAt: '11월 12일 오후 6:00' },
		tl: [
			L('11월 6일 오전 10:40', '고객이 교환을 요청했어요', '고객'),
			L('11월 6일 오후 3:00', '준이 승인했어요 · 이벗 회수 신청', '크리에이터'),
			L('11월 7일 오전 10:00', '회수 운송장 · 롯데택배 2391-8650-7712', '자동'),
			L('11월 9일 오후 2:30', '회수 확인 · 재발송 예약', '운영 박서연'),
			L('11월 10일 오전 11:00', '이벗 교환 주문 등록 · 배송준비중', '자동'),
			L('11월 10일 오후 6:00', '재발송 운송장 · 우체국택배 6896-1123-4410 · 고객에게 알림', '자동'),
			L('11월 12일 오후 6:00', '배송 완료 · 택배사 연동 · 교환 완료', '자동')
		]
	}),
	// 반려: 교환
	K('R-0297', 'MYR1474', 'c4', 'p10', 1, '교환', '파손 · 누액', 'rejected', '11월 5일', '정*현', {
		opts: [op('reship', '새 제품 재발송', '회수 없이 바로 출고 · 배송비 MYR 부담', false, false), op('refund', '환불로 전환', '₩34,000 환불 · 회수 없이 바로 환불', false, true, 34000)],
		okAt: '11월 6일',
		by: '소이',
		text: '병에 작은 흠집이 있어요.',
		photos: 1,
		msg: '사진으로 보면 사용에 문제가 없는 흠집이라 교환이 어려워요. 양해 부탁드려요.',
		tl: [L('11월 5일 오후 2:10', '고객이 교환을 요청했어요', '고객'), L('11월 6일 오전 11:00', '소이가 반려했어요', '크리에이터')]
	})
];

// ───────── 고객 문의 ─────────

export type InquiryStatus = 'open' | 'answered' | 'closed';
/** 고객 문의 탭(시안 2026-11-27) — 문의 · 교환 · 환불(처리 대기 요청) · 48시간 넘은 미답변(문의 + 답변 기한 지난 요청) · 답변 완료(답변 · 종료 문의 + 반려 요청) */
export type InquiryTab = 'open' | 'claims' | 'late' | 'answered';

export interface InquiryMsg {
	who: 'c' | 'a';
	text: string;
	time: string;
	/** 답변한 크리에이터 이름 · 운영 대행 여부 */
	name: string | null;
	proxy: boolean;
}
export interface InquiryRaw {
	id: string;
	who: string;
	productId: string;
	q: string;
	/** 마지막 움직임부터 지난 분 — 서버가 계산한 값(여기선 시드) */
	mins: number;
	status: InquiryStatus;
	msgs: InquiryMsg[];
}

export interface InquiryRow {
	id: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	meta: string;
	title: string;
	sub: string;
	href: string;
	right?: string;
	rightSub?: string;
	rightSubTone?: Tone;
}

export interface InquiryView {
	id: string;
	tab: InquiryTab;
	title: string;
	sub: string;
	chip: Chip;
	msgs: { who: 'c' | 'a'; text: string; time: string; name: string }[];
	info: { k: string; v: string; href?: string }[];
	canReply: boolean;
	reply: { title: string; ph: string; max: number; note: string; ok: string };
}

const INQ_EMPTY: Record<InquiryTab, string> = {
	open: '답변을 기다리는 문의가 없어요',
	claims: '답변을 기다리는 교환 · 환불 요청이 없어요',
	late: '48시간 넘은 미답변이 없어요',
	answered: '답변 완료한 문의가 없어요'
};
const LATE_MINS = 48 * 60;

const M = (who: 'c' | 'a', text: string, time: string, name: string | null = null, proxy = false): InquiryMsg => ({ who, text, time, name, proxy });
const Q = (id: string, who: string, productId: string, q: string, mins: number, status: InquiryStatus, msgs: InquiryMsg[]): InquiryRaw => ({ id, who, productId, q, mins, status, msgs });

const seedInquiries = (): InquiryRaw[] => [
	Q('Q-2038', '박*훈', 'p5', '임산부도 먹어도 되나요? 성분표를 봐도 잘 모르겠어요.', 50 * 60, 'open', [M('c', '임산부도 먹어도 되나요? 성분표를 봐도 잘 모르겠어요.', '11월 16일 오전 8:14')]),
	Q('Q-2035', '이*서', 'p10', '개봉 후 사용 기한이 궁금해요.', 22 * 60, 'open', [M('c', '개봉 후 사용 기한이 궁금해요.', '11월 16일 오후 12:02')]),
	Q('Q-2041', '김*린', 'p1', '저녁에 먹어도 효과가 있나요? 야근이 많아서 점심에 챙기기가 어려워요.', 32, 'open', [M('c', '저녁에 먹어도 효과가 있나요? 야근이 많아서 점심에 챙기기가 어려워요.', '오전 9:48')]),
	Q('Q-2030', '최*아', 'p3', '하루에 두 포 먹어도 되나요?', 50 * 60, 'answered', [
		M('c', '하루에 두 포 먹어도 되나요?', '11월 15일 오전 9:31'),
		M('a', '하루 한 포가 권장량이에요. 두 포를 드셔도 문제는 없지만 한 포로 충분해요.', '11월 15일 오전 11:20', '민지')
	]),
	Q('Q-2026', '한*람', 'p7', '우유에 타 먹어도 되나요?', 70 * 60, 'answered', [M('c', '우유에 타 먹어도 되나요?', '11월 14일 오후 7:45'), M('a', '네, 우유나 두유 200ml에 타서 드셔도 좋아요.', '11월 15일 오전 9:02', '준', true)]),
	Q('Q-2019', '윤*호', 'p13', '배송지를 바꿀 수 있나요?', 120 * 60, 'closed', [
		M('c', '배송지를 바꿀 수 있나요?', '11월 12일 오후 1:10'),
		M('a', '출고 전이라 바꿔 드렸어요. 주문 내역에서 확인해 주세요.', '11월 12일 오후 2:05', '온유', true)
	])
];

/** 지난 시간 한 마디 — 방금 · 32분 전 · 26시간 전 · 3일 전 */
const ago = (mins: number) => (mins < 1 ? '방금' : mins < 60 ? `${mins}분 전` : mins < 48 * 60 ? `${Math.floor(mins / 60)}시간 전` : `${Math.round(mins / 60 / 24)}일 전`);

export interface CsCounts {
	/** 답변 대기 · 그중 24시간 넘은 것 · 가장 오래된 미답변 */
	inqOpen: number;
	inqLate: number;
	inqLateOldest: string | null;
	/** 운영이 처리할 교환 · 환불 — 회수 확인 필요(그중 이벗 회수 신청 실패) · 재발송 예약(이벗이 자동 발송 — 기다리기만) · 환불 실패(가장 오래된 실패 시각) */
	pickup: number;
	pickupFail: number;
	/** 회수 운송장이 나와 회수 확인할 차례 · 그중 환불 */
	pickupWay: number;
	pickupWayRefund: number;
	/** 회수 확인 필요 중 회수 뒤 환불 · 회수 뒤 재발송 */
	resend: number;
	refundRetry: number;
	refundOldest: string | null;
	/** 처리 대기(승인 · 반려 전) · 그중 크리에이터 답변 기한 넘김(가장 많이 지난 날) */
	pending: number;
	creatorLate: number;
	creatorLateOldest: string | null;
}

type Result = { ok: boolean; msg: string };
const okR = (msg: string): Result => ({ ok: true, msg });
const noR = (msg: string): Result => ({ ok: false, msg });

class CsServer {
	claimsRaw = $state<ClaimRaw[]>(seedClaims());
	inquiriesRaw = $state<InquiryRaw[]>(seedInquiries());

	// ── 건수(홈 · 메뉴 배지 · SubNav 배지 · 요약 한 줄)
	get counts(): CsCounts {
		const open = this.inquiriesRaw.filter((q) => q.status === 'open');
		const late = open.filter((q) => q.mins >= LATE_MINS);
		const st = (s: ClaimStage) => this.claimsRaw.filter((k) => k.stage === s);
		const refund = st('refund');
		const pending = st('pending');
		const creatorLate = pending.filter((k) => k.late > 0);
		return {
			inqOpen: open.length,
			inqLate: late.length,
			inqLateOldest: late.length ? ago(Math.max(...late.map((q) => q.mins))) : null,
			pickup: st('pickup').length,
			pickupFail: st('pickup').filter((k) => k.pickup?.state === 'failed').length,
			pickupWay: st('pickup').filter((k) => k.pickup?.state === 'assigned').length,
			pickupWayRefund: st('pickup').filter((k) => k.pickup?.state === 'assigned' && !!this.chosen(k)?.refunds).length,
			resend: st('resend').length,
			refundRetry: refund.length,
			refundOldest: refund[0]?.fail?.split(' · ')[1]?.replace(/ \(.*\)$/, '') ?? null,
			pending: pending.length,
			creatorLate: creatorLate.length,
			creatorLateOldest: creatorLate.length ? `${Math.max(...creatorLate.map((k) => k.late))}일 지남` : null
		};
	}

	/** 메뉴 안 화면 고르기(시안 csSubs) — 교환 · 환불(운영이 처리할 일 + 처리 대기) · 고객 문의(답변 대기) */
	subs(): { key: string; label: string; href: string; n?: number }[] {
		const c = this.counts;
		return [
			{
				key: 'claims',
				label: '교환 · 환불',
				href: '/cs',
				n: c.pickupWay + c.pickupFail + c.refundRetry
			},
			{
				key: 'inquiries',
				label: '고객 문의',
				href: '/cs/inquiries',
				n: c.inqOpen + c.pending
			}
		];
	}

	// ── 교환 · 환불(시안 2026-11-27)
	claimSummary(): string {
		const c = this.counts;
		return `회수 확인 필요 ${c.pickupWay}건(환불 ${c.pickupWayRefund} · 재발송 ${c.pickupWay - c.pickupWayRefund})`;
	}

	/** 탭에 들어가는가 — 교환 = 재발송 처리(회수 단계 + 자동 발송) · 환불 = 환불 처리(회수 단계 + 환불 실패) · 회수 확인 필요 = 회수 운송장이 나온 회수 단계 · 처리 대기 · 반려는 이 목록에 없다 */
	private inTab(k: ClaimRaw, tab: ClaimTab) {
		if (k.stage === 'pending' || k.stage === 'rejected') return false;
		const refunds = !!this.chosen(k)?.refunds;
		switch (tab) {
			case 'all':
				return true;
			case 'collect':
				return k.stage === 'pickup' && k.pickup?.state === 'assigned';
			case 'exchanges':
				return !refunds && (k.stage === 'pickup' || k.stage === 'resend');
			case 'refunds':
				return refunds && (k.stage === 'pickup' || k.stage === 'refund');
			case 'done':
				return k.stage === 'done';
		}
	}
	/** 요청이 속한 탭(상세 뒤로가기 · 주소에 온 탭이 없을 때) */
	private tabOf(k: ClaimRaw): ClaimTab {
		if (k.stage === 'done') return 'done';
		return this.chosen(k)?.refunds ? 'refunds' : 'exchanges';
	}

	claimTabs(): { id: ClaimTab; name: string; count: number; hot?: boolean }[] {
		const t = (tab: ClaimTab) => this.claimsRaw.filter((k) => this.inTab(k, tab)).length;
		return [
			{ id: 'exchanges', name: '교환', count: t('exchanges') },
			{ id: 'refunds', name: '환불', count: t('refunds') },
			{ id: 'collect', name: '회수 확인 필요', count: t('collect') },
			{ id: 'done', name: '완료', count: t('done') },
			{ id: 'all', name: '전체', count: t('all') }
		];
	}

	/** 요청 한 줄 — 교환 · 환불 목록과 고객 문의의 [교환 · 환불] · [48시간 넘은 미답변] · [답변 완료] 탭이 같이 쓴다 */
	private claimRow(k: ClaimRaw, href: string): ClaimRow & { txt: string } {
		const p = productOf(k.productId);
		const x = creatorOf(k.creatorId);
		const evt = this.claimEvt(k);
		const todo = this.claimTodo(k);
		const st = this.stateChip(k);
		return {
			id: k.id,
			thumb: { tile: p.tile, icon: p.icon },
			chips: st ? [this.kindChip(k), st] : [this.kindChip(k)],
			meta: `${k.id} · ${k.ord} · ${k.at} 접수`,
			title: `${p.name} × ${k.qty}`,
			sub: `${x.name} · ${k.why}${evt ? ` · ${evt}` : k.by ? ` · ${k.okAt} ${k.by} ${k.stage === 'rejected' ? '반려' : '승인'}` : ''}`,
			right: won(p.price * k.qty),
			rightSub:
				todo && todo.t !== '회수 확인'
					? todo.t
					: k.stage === 'pending'
						? `${k.due}까지 답변`
						: k.stage === 'resend'
							? k.reship?.state === 'shipped'
								? '배송 중'
								: k.reship?.state === 'ordered'
									? '운송장 수집 대기'
									: '교환 발주 대기'
							: k.stage === 'pickup' && k.pickup?.state !== 'failed'
								? k.pickup?.state === 'assigned'
									? '택배 조회 후 회수 확인'
									: '회수 운송장 수집 대기'
								: '',
			rightSubTone: todo ? todo.tone : 'grey',
			href,
			txt: `${k.id} ${k.ord} ${p.name} ${x.name} ${k.why}`.toLowerCase()
		};
	}

	claims({ tab, q }: { tab: ClaimTab; q: string }): {
		rows: ClaimRow[];
		empty: string;
	} {
		const needle = q.trim().toLowerCase();
		const rows = this.claimsRaw
			.filter((k) => this.inTab(k, tab))
			.map((k) => this.claimRow(k, `/cs/${k.id}?tab=${tab}`))
			.filter((r) => !needle || r.txt.includes(needle));
		return {
			rows,
			empty: needle && !rows.length ? '검색 결과가 없어요' : CLAIM_EMPTY[tab]
		};
	}

	private rawClaim(id: string) {
		return this.claimsRaw.find((k) => k.id === id);
	}
	private amountOf(k: ClaimRaw) {
		return productOf(k.productId).price * k.qty;
	}
	/** 승인한 처리 방법의 선택지(서버 응답) */
	private chosen(k: ClaimRaw) {
		return k.opts.find((o) => o.id === k.res) ?? null;
	}
	/** 처리 방법 이름(시안) — 서버 선택지의 회수 · 환불 값으로: 환불(회수 없이) · 반품(회수 후 환불) · 재발송(회수 없이) · 회수 후 재발송 */
	private optName(o: ClaimOpt): string {
		if (o.refunds) return o.collects ? '반품' : '환불';
		return o.collects ? '회수 후 재발송' : '재발송';
	}
	/** 목록 첫 칩 — 승인 전 · 반려는 고객이 요청한 종류, 승인 뒤는 처리 방법 이름 · 환불 쪽은 주황 */
	private kindChip(k: ClaimRaw): Chip {
		const ch = this.chosen(k);
		if (!ch || k.stage === 'pending' || k.stage === 'rejected') return { label: k.kind, tone: k.kind === '환불' ? 'orange' : 'plain' };
		return { label: this.optName(ch), tone: ch.refunds ? 'orange' : 'plain' };
	}
	/** 지금 상태 칩(시안) — 주황 운영 할 일 · 빨강 막힘 · 회색 · 민트 자동 진행 또는 끝 · 회수 운송장 전에는 칩 없음 */
	private stateChip(k: ClaimRaw): Chip | null {
		if (k.stage === 'pending') return k.late ? { label: `${k.ago ? `${k.ago} · ` : ''}48시간 넘음`, tone: 'red' } : { label: '크리에이터 답변 대기', tone: 'grey' };
		if (k.stage === 'pickup') return k.pickup?.state === 'failed' ? { label: '회수 신청 실패', tone: 'red' } : k.pickup?.state === 'assigned' ? { label: '회수 확인 필요', tone: 'orange' } : null;
		if (k.stage === 'resend') return { label: '자동 발송', tone: 'mint' };
		if (k.stage === 'refund') return { label: '환불 실패', tone: 'red' };
		if (k.stage === 'done') return { label: this.chosen(k)?.refunds ? '환불 완료' : '교환 완료', tone: 'grey' };
		return { label: '반려', tone: 'grey' };
	}
	/** 운영이 직접 눌러야 하는 일 — 없으면 null(재발송 · 회수 확인이 끝난 재발송은 이벗이 자동으로) */
	private claimTodo(k: ClaimRaw): { t: string; tone: Tone } | null {
		if (k.stage === 'pickup') return k.pickup?.state === 'failed' ? { t: '회수 다시 신청', tone: 'red' } : k.pickup?.state === 'assigned' ? { t: '회수 확인', tone: 'orange' } : null;
		if (k.stage === 'refund') return { t: '환불 다시', tone: 'red' };
		if (k.stage === 'pending' && k.late) return { t: '대신 승인 · 반려', tone: 'orange' };
		return null;
	}
	/** 목록 둘째 줄 진행 문구 */
	private claimEvt(k: ClaimRaw): string {
		const pk = k.pickup;
		if (k.stage === 'pickup' && pk) return pk.state === 'failed' ? '' : pk.tracking ? `회수 운송장 ${pk.carrier} ${pk.tracking}` : `회수 접수 ${pk.code ?? ''}`.trim();
		if (k.stage === 'resend' && k.reship) return k.reship.state === 'shipped' ? `배송 중 · ${k.reship.carrier} ${k.reship.tracking}` : k.reship.state === 'ordered' ? '교환 발주 완료 · 오후 6시 운송장 수집' : '평일 오전 11시 이벗 교환 발주';
		return '';
	}
	/** 물류 대행사 처리 칸 — 회수만(환불) · 회수 후 재발송(회수 3단계 + 재발송 3단계) · 재발송(교환 접수 + 재발송 3단계) */
	private logi(k: ClaimRaw): ClaimView['logi'] {
		const ch = this.chosen(k);
		if (!ch || k.stage === 'pending' || k.stage === 'rejected') return null;
		if (ch.refunds && !ch.collects) return null;
		const fin = k.stage === 'done' || k.stage === 'refund';
		const mk = (defs: [string, string | undefined][], r: number) =>
			defs.map(([label, at], i) => ({ label, at: i <= r ? (at ?? '') : '', state: (i > r ? 'todo' : i === r && !fin ? 'now' : 'done') as 'done' | 'now' | 'todo' | 'fail' }));
		const pk = k.pickup;
		const rs = k.reship;
		const pick: [string, string | undefined][] = [
			['회수 접수', pk?.at],
			['회수 운송장(매일 오전 10시 자동)', pk?.assignedAt],
			['회수 완료(운영 확인)', pk?.doneAt]
		];
		if (!rs) {
			const r = pk?.state === 'failed' ? -1 : pk?.doneAt ? 2 : pk?.state === 'assigned' ? 1 : 0;
			const steps = mk(pick, r);
			if (pk?.state === 'failed') steps[0] = { label: '회수 접수 실패', at: pk.at, state: 'fail' };
			return {
				chip: pk?.state === 'failed' ? { label: '회수 신청 실패', tone: 'red' } : pk?.doneAt ? { label: '회수 완료', tone: 'grey' } : pk?.state === 'assigned' ? { label: '운송장 확인 필요', tone: 'orange' } : { label: '회수 중', tone: 'grey' },
				steps,
				rows: [
					{ k: '이벗 회수 접수', v: pk?.code ?? '—', tone: pk?.code ? 'plain' : 'grey' },
					{ k: '회수 운송장', v: pk?.tracking ? `${pk.carrier} ${pk.tracking}` : pk?.state === 'failed' ? '—' : '매일 오전 10시에 받아와요', tone: pk?.tracking ? 'plain' : 'grey' }
				]
			};
		}
		const collected = !!pk?.doneAt;
		const ordered = rs.state !== 'queued';
		const r = (rs.state === 'delivered' ? 3 : rs.state === 'shipped' ? 2 : ordered ? 1 : 0) + (collected ? 2 : 0);
		const defs: [string, string | undefined][] = [...(collected ? pick : [['교환 접수', rs.reqAt] as [string, string]]), ['교환 발주', ordered ? rs.at : undefined], ['재발송 운송장', rs.shippedAt], ['배송 완료', rs.deliveredAt]];
		return {
			chip: rs.state === 'delivered' ? { label: '배송 완료', tone: 'grey' } : collected && !ordered ? { label: '회수 완료', tone: 'grey' } : { label: '재발송 중', tone: 'grey' },
			steps: mk(defs, r),
			rows: [
				...(pk?.code ? [{ k: '이벗 회수 접수', v: pk.code, tone: 'plain' as const }] : []),
				...(collected && pk?.tracking ? [{ k: '회수 운송장', v: `${pk.carrier} ${pk.tracking}`, tone: 'plain' as const }] : []),
				{ k: '교환 주문', v: rs.code ?? '평일 오전 11시에 발주해요', tone: rs.code ? 'plain' : 'grey' },
				{ k: '재발송 운송장', v: rs.tracking ? `${rs.carrier} ${rs.tracking}` : rs.state === 'ordered' ? '오후 6시에 받아와요' : '—', tone: rs.tracking ? 'plain' : 'grey' }
			]
		};
	}

	claim(id: string): ClaimView | null {
		const k = this.rawClaim(id);
		if (!k) return null;
		const p = productOf(k.productId);
		const x = creatorOf(k.creatorId);
		const amount = won(this.amountOf(k));
		const ch = this.chosen(k);
		const todo = this.claimTodo(k);
		const side: ClaimView['side'] = [
			{ k: '크리에이터', v: `${x.name} ${x.handle}`, tone: 'plain', href: `/creators/${x.id}` },
			{ k: '고객', v: k.who, tone: 'plain' },
			{ k: '접수', v: k.at, tone: 'plain' },
			k.okAt ? { k: k.stage === 'rejected' ? '반려' : '승인', v: `${k.okAt} · ${k.by}`, tone: 'plain' } : { k: '답변 기한', v: k.late ? `${k.due}까지 · ${k.late}일 지남` : `${k.due}까지`, tone: k.late ? 'red' : 'plain' },
			...(ch && k.stage !== 'rejected' ? [{ k: '처리 방법', v: this.optName(ch), tone: 'plain' as const }] : []),
			{
				k: '운영 할 일',
				v: todo ? todo.t : k.stage === 'resend' ? '없음 · 이벗 자동 진행' : k.stage === 'pickup' ? '없음 · 회수 운송장 수집 대기' : k.stage === 'pending' ? '없음 · 크리에이터 답변 대기' : '없음',
				tone: todo ? todo.tone : 'grey'
			}
		];
		const notes: ClaimView['notes'] = [];
		let armed: Armed | null = null;
		let action: ClaimView['action'] = null;
		const pk = k.pickup;
		if (k.stage === 'pickup' && pk?.state === 'failed') {
			action = 'retry';
			notes.push({ tone: 'red', lines: [`회수 신청이 실패했어요(${pk.at})`, '[회수 다시 신청]을 눌러 다시 신청해 주세요'] });
		} else if (k.stage === 'pickup' && pk?.state === 'requested') {
			notes.push({ tone: 'grey', text: '회수 운송장이 나오면 택배 조회로 도착을 확인해요' });
		} else if (k.stage === 'pickup') {
			action = 'pickup';
			notes.push({ tone: 'orange', text: '택배 조회로 회수가 끝났는지 확인한 뒤 [회수 완료]를 눌러 주세요' });
			armed = {
				label: '회수 완료',
				sure: '정말 회수 완료하기',
				note: ch?.refunds ? `회수를 확인하면 바로 환불돼요 · ${won(ch.quote ?? 0)}` : '회수를 확인하면 평일 오전 11시에 이벗 교환 발주가 들어가요'
			};
		} else if (k.stage === 'resend') {
			notes.push({ tone: 'grey', text: k.reship?.state === 'shipped' ? '배송 중이에요 · 배송이 끝나면 교환 완료로 바뀌어요' : k.reship?.state === 'ordered' ? '오후 6시에 운송장을 수집해요 · 배송이 끝나면 교환 완료로 바뀌어요' : '평일 오전 11시에 교환 발주가 들어가요' });
		} else if (k.stage === 'refund') {
			action = 'refund';
			notes.push({ tone: 'red', text: k.fail ?? '' });
			armed = { label: '환불 다시', sure: '정말 환불 다시 하기', note: `결제 수단으로 ${won(ch?.quote ?? this.amountOf(k))}을 다시 환불해요` };
		} else if (k.stage === 'pending') {
			action = 'decide';
			notes.push({ tone: 'orange', text: PROXY_NOTE });
		}
		const inq = k.stage === 'pending' || k.stage === 'rejected';
		return {
			id: k.id,
			stage: k.stage,
			back: inq ? { href: `/cs/inquiries?tab=${k.stage === 'pending' ? 'claims' : 'answered'}`, label: '고객 문의 목록으로' } : { href: `/cs?tab=${this.tabOf(k)}`, label: '교환 · 환불 목록으로' },
			title: `${k.id} · ${k.kind} 요청`,
			thumb: { tile: p.tile, icon: p.icon },
			request: { chip: { label: `${k.kind} · ${k.why}`, tone: 'plain' }, text: k.text },
			photos: Array.from({ length: k.photos }, (_, i) => ({ label: `사진 ${i + 1}`, bg: PHOTO_BG[i % PHOTO_BG.length] })),
			photosTitle: `고객 사진 ${k.photos}장`,
			message: k.msg ? { title: `${k.by ?? x.name} 메시지`, text: k.msg } : null,
			order: [
				{ k: '주문번호', v: k.ord },
				{ k: '상품', v: `${p.name} × ${k.qty}` },
				{ k: k.kind === '환불' ? '환불 대상 금액' : '상품 금액', v: amount }
			],
			timeline: k.tl,
			stageChip: this.stateChip(k),
			side,
			logi: this.logi(k),
			notes,
			action,
			armed,
			trackToast: pk?.carrier ? `${pk.carrier} 조회 페이지를 새 창으로 열었어요` : '택배 조회 페이지를 새 창으로 열었어요'
		};
	}

	/** 모달 문구(시안 modalDef · claimOk · claimNo · resend) */
	claimModal(id: string, which: 'approve' | 'reject'): ClaimModal | null {
		const k = this.rawClaim(id);
		if (!k) return null;
		const desc = `${k.id} · ${productOf(k.productId).name} × ${k.qty}`;
		if (which === 'approve') {
			const sureInfo: Record<string, string> = {};
			for (const o of k.opts) sureInfo[o.id] = o.refunds && !o.collects ? `정말 승인할까요? 바로 환불돼요 · ${won(o.quote ?? 0)}` : !o.refunds && !o.collects ? '정말 승인할까요? 이벗 교환 신청이 바로 들어가요' : '정말 승인할까요? 이벗 회수 신청이 바로 들어가요';
			return {
				title: '승인',
				desc,
				info: PROXY_NOTE,
				ok: '승인',
				sure: '정말 승인하기',
				sureInfo,
				options: {
					label: '처리 방법',
					items: k.opts.map((o) => ({ id: o.id, title: this.optName(o) })),
					value: k.opts[0]?.id ?? '',
					hint: '환불 · 재발송은 회수 없이 바로 처리해요 · 반품 · 회수 후 재발송은 물건을 돌려받은 뒤 처리해요'
				},
				msg: { label: '고객에게 보낼 메시지 (선택)', ph: '비워 두면 처리 결과, 다음 단계만 메일로 안내돼요', max: 300, required: false }
			};
		}
		return {
			title: '반려',
			desc,
			info: PROXY_NOTE,
			ok: '반려',
			sure: '정말 반려하기',
			sureInfo: { _: '정말 반려할까요? 고객에게 바로 메일이 가요' },
			msg: { label: '고객에게 보낼 메시지', ph: '반려하는 이유를 고객에게 알려 주세요', max: 300, required: true }
		};
	}

	private patchClaim(id: string, fn: (k: ClaimRaw) => Partial<ClaimRaw>) {
		this.claimsRaw = this.claimsRaw.map((k) => (k.id === id ? { ...k, ...fn(k) } : k));
	}

	/** [회수 완료(운영 확인)](운영 — 회수 운송장 택배 조회로 회수가 끝난 걸 확인한 뒤) — 환불이면 바로 환불 · 교환이면 재발송 예약으로 */
	confirmPickup(id: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pickup') return noR('회수를 기다리는 요청이 아니에요');
		const ch = this.chosen(k);
		const amount = won(ch?.quote ?? 0);
		const refund = !!ch?.refunds;
		if (k.pickup?.state === 'failed') return noR('이벗 회수 신청이 실패한 요청이에요 — 먼저 [회수 다시 신청]을 눌러 주세요');
		if (k.pickup?.state !== 'assigned') return noR('회수 운송장이 아직 나오지 않았어요 — 운송장이 나오면 택배 조회로 회수가 끝났는지 확인해 주세요');
		this.patchClaim(id, (o) => ({
			stage: refund ? 'done' : 'resend',
			pickup: o.pickup ? { ...o.pickup, doneAt: stamp() } : null,
			reship: refund ? null : { state: 'queued', reqAt: stamp(), at: '11월 18일(수) 오전 11시' },
			tl: [...o.tl, L(stamp(), refund ? `회수 확인 · 환불 완료 ${amount}` : '회수 확인', me())]
		}));
		return okR(refund ? `회수 확인 · ${amount} 환불했어요` : '회수를 확인했어요 · 평일 오전 11시에 이벗 교환 발주가 들어가요');
	}

	/** [회수 다시 신청] — 이벗 회수 신청이 실패한 요청을 다시 신청(UI 단계 — 목에서 신청됨으로) */
	retryPickup(id: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pickup' || k.pickup?.state !== 'failed') return noR('회수 신청이 실패한 요청이 아니에요');
		this.patchClaim(id, (o) => ({
			pickup: { state: 'requested', at: stamp(), code: 'RP2611170201' },
			tl: [...o.tl, L(stamp(), '이벗 회수 다시 신청', me())]
		}));
		return okR('이벗 회수를 다시 신청했어요');
	}

	/** [환불 다시] — 결제 수단으로 다시 환불 */
	refundAgain(id: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'refund') return noR('환불을 다시 해야 하는 요청이 아니에요');
		const amount = won(this.amountOf(k));
		this.patchClaim(id, (o) => ({
			stage: 'done',
			fail: null,
			tl: [...o.tl, L(stamp(), `환불 다시 · 환불 완료 ${amount}`, me())]
		}));
		return okR(`${amount} 환불했어요`);
	}

	/** [승인] — 운영 대행 · 처리 방법은 서버 선택지(사유 · 종류별) · 메시지는 선택. 승인 뒤 갈 곳은 처리 방법이 정한다:
	 *  회수가 필요하면 이벗 회수 자동 신청 → 회수 확인 필요 · 회수 없는 환불(파손 · 누액)은 샵이 바로 환불 → 완료 · 회수 없는 재발송은 바로 재발송 예약 */
	approve(id: string, res: string, msg: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pending') return noR('처리를 기다리는 요청이 아니에요');
		const o0 = k.opts.find((x) => x.id === res);
		if (!o0) return noR('처리 방법을 골라 주세요');
		const m = msg.trim();
		if (m.length > 300) return noR('메시지는 300자까지 적을 수 있어요');
		const name = this.optName(o0);
		const base = { res: o0.id, okAt: '11월 17일', by: me(), late: 0, msg: m || null };
		if (o0.collects) {
			this.patchClaim(id, (o) => ({ ...base, stage: 'pickup', pickup: { state: 'requested', at: stamp(), code: 'RP2611170199' }, tl: [...o.tl, L(stamp(), `승인 · ${name} · 이벗 회수 신청 (운영 대행)`, me())] }));
			return okR('승인했어요 · 회수 대기로 넘어갔어요');
		}
		if (o0.refunds) {
			const amount = won(o0.quote ?? 0);
			this.patchClaim(id, (o) => ({ ...base, stage: 'done', tl: [...o.tl, L(stamp(), `승인 · ${name} (운영 대행)`, me()), L(stamp(), `회수 없이 환불 완료 ${amount}`, '자동')] }));
			return okR(`승인했어요 · ${amount} 환불했어요`);
		}
		this.patchClaim(id, (o) => ({ ...base, stage: 'resend', reship: { state: 'queued', reqAt: stamp(), at: '11월 18일(수) 오전 11시' }, tl: [...o.tl, L(stamp(), `승인 · ${name} · 재발송 예약 (운영 대행)`, me())] }));
		return okR('승인했어요 · 이벗 교환 신청이 들어갔어요');
	}

	/** [반려] — 운영 대행 · 고객에게 보낼 메시지 필수 */
	reject(id: string, msg: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pending') return noR('처리를 기다리는 요청이 아니에요');
		const m = msg.trim();
		if (!m) return noR('고객에게 보낼 메시지를 적어 주세요');
		if (m.length > 300) return noR('메시지는 300자까지 적을 수 있어요');
		this.patchClaim(id, (o) => ({
			stage: 'rejected',
			okAt: '11월 17일',
			by: me(),
			late: 0,
			msg: m,
			tl: [...o.tl, L(stamp(), '반려 (운영 대행)', me())]
		}));
		return okR('반려했어요 · 고객에게 메일을 보냈어요');
	}

	// ── 고객 문의(시안 2026-11-27 — 승인 전 교환 · 환불 요청도 '답이 안 나간 것'이라 여기서 본다 · 승인하면 교환 · 환불로 넘어간다)
	inquirySummary(): string {
		const c = this.counts;
		return `48시간 넘은 미답변 ${c.inqLate + c.creatorLate}건`;
	}

	inquiryTabs(): { id: InquiryTab; name: string; count: number; hot?: boolean }[] {
		const c = this.counts;
		const rej = this.claimsRaw.filter((k) => k.stage === 'rejected').length;
		const answered = this.inquiriesRaw.filter((q) => q.status !== 'open').length;
		return [
			{ id: 'open', name: '문의', count: c.inqOpen },
			{ id: 'claims', name: '교환 · 환불', count: c.pending },
			{ id: 'late', name: '48시간 넘은 미답변', count: c.inqLate + c.creatorLate, hot: true },
			{ id: 'answered', name: '답변 완료', count: answered + rej }
		];
	}

	private inqChip(q: InquiryRaw): Chip {
		if (q.status === 'open') {
			const late = q.mins >= LATE_MINS;
			return { label: late ? `${ago(q.mins)} · 48시간 넘음` : ago(q.mins), tone: late ? 'red' : 'mint' };
		}
		return { label: '답변 완료', tone: 'grey' };
	}

	inquiries({ tab, q }: { tab: InquiryTab; q: string }): {
		rows: InquiryRow[];
		empty: string;
	} {
		const needle = q.trim().toLowerCase();
		const inq = (i: InquiryRaw) => (tab === 'open' ? i.status === 'open' : tab === 'late' ? i.status === 'open' && i.mins >= LATE_MINS : tab === 'answered' ? i.status !== 'open' : false);
		const inqRows = this.inquiriesRaw.filter(inq).map((i): InquiryRow & { txt: string } => {
			const p = productOf(i.productId);
			const x = creatorOf(p.creatorId);
			return {
				id: i.id,
				thumb: { tile: p.tile, icon: p.icon },
				chips: [this.inqChip(i)],
				meta: `${i.id} · ${i.who}${i.status === 'open' ? '' : ` · ${ago(i.mins)}`}`,
				title: i.q,
				sub: `${p.name} · ${x.name}`,
				href: `/cs/inquiries/${i.id}?tab=${tab}`,
				txt: `${i.id} ${i.who} ${p.name} ${i.q} ${x.name}`.toLowerCase()
			};
		});
		const claimPick = (k: ClaimRaw) => (tab === 'claims' ? k.stage === 'pending' : tab === 'late' ? k.stage === 'pending' && k.late > 0 : tab === 'answered' ? k.stage === 'rejected' : false);
		const claimRows = this.claimsRaw.filter(claimPick).map((k) => this.claimRow(k, `/cs/${k.id}?from=inq&tab=${tab}`));
		const rows = [...inqRows, ...claimRows].filter((r) => !needle || r.txt.includes(needle));
		return {
			rows,
			empty: needle && !rows.length ? '검색 결과가 없어요' : INQ_EMPTY[tab]
		};
	}

	private rawInquiry(id: string) {
		return this.inquiriesRaw.find((q) => q.id === id);
	}

	inquiry(id: string): InquiryView | null {
		const i = this.rawInquiry(id);
		if (!i) return null;
		const p = productOf(i.productId);
		const x = creatorOf(p.creatorId);
		return {
			id: i.id,
			tab: i.status === 'open' ? (i.mins >= LATE_MINS ? 'late' : 'open') : 'answered',
			title: i.q,
			sub: `${i.id} · ${i.who} · ${p.name}`,
			chip: this.inqChip(i),
			msgs: i.msgs.map((m) => ({
				who: m.who,
				text: m.text,
				time: m.time,
				name: m.who === 'c' ? '고객' : `${m.name ?? x.name}${m.proxy ? ' · 운영 대행' : ''}`
			})),
			info: [
				{ k: '문의번호', v: i.id },
				{ k: '고객', v: i.who },
				{ k: '상품', v: p.name },
				{
					k: '크리에이터',
					v: `${x.name} ${x.handle}`,
					href: `/creators/${x.id}`
				}
			],
			canReply: i.status === 'open',
			reply: {
				title: '대행 답변',
				ph: '고객에게 보낼 답변을 적어 주세요',
				max: 500,
				note: '고객에게는 크리에이터 이름으로 보여요',
				ok: '대행 답변 보내기'
			}
		};
	}

	private patchInquiry(id: string, fn: (q: InquiryRaw) => Partial<InquiryRaw>) {
		this.inquiriesRaw = this.inquiriesRaw.map((q) => (q.id === id ? { ...q, ...fn(q) } : q));
	}

	/** [대행 답변 보내기] — 크리에이터 이름으로 · 운영 대행 표시 · 500자까지 */
	reply(id: string, text: string): Result {
		const i = this.rawInquiry(id);
		if (!i || i.status !== 'open') return noR('이미 답변한 문의예요 — 답변은 한 번만 보낼 수 있어요');
		const t = text.trim();
		if (!t) return noR('답변 내용을 적어 주세요');
		if (t.length > 500) return noR('답변은 500자까지 적을 수 있어요');
		const x = creatorOf(productOf(i.productId).creatorId);
		this.patchInquiry(id, (o) => ({
			status: 'answered',
			mins: 0,
			msgs: [...o.msgs, M('a', t, NOW.time, x.name, true)]
		}));
		return okR(`${x.name} 이름으로 답변을 보냈어요`);
	}

}

export const cs = new CsServer();
