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

/** 지금 단계 — 처리 대기(승인 · 반려 전) · 회수 대기 · 재발송 대기 · 환불 다시 필요 · 완료 · 반려 */
export type ClaimStage = 'pending' | 'pickup' | 'resend' | 'refund' | 'done' | 'rejected';
export type ClaimKind = '환불' | '교환';
export type ClaimTab = ClaimStage | 'all';

export interface ClaimRaw {
	id: string;
	ord: string;
	creatorId: string;
	productId: string;
	qty: number;
	kind: ClaimKind;
	why: string;
	stage: ClaimStage;
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
	/** 환불 다시 필요 — 실패 원문 */
	fail: string | null;
	/** 재발송 송장 */
	resent: string | null;
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
}

/** 되돌릴 수 없는 한 번 더 확인 버튼(ArmedButton) 문구 */
export interface Armed {
	label: string;
	sure: string;
	note: string;
}

export interface ClaimView {
	id: string;
	tab: ClaimTab;
	stage: ClaimStage;
	title: string;
	sub: string;
	thumb: { tile: string; icon: string };
	amount: string;
	request: { chip: Chip; text: string };
	photos: { label: string; bg: string }[];
	photosTitle: string;
	message: { title: string; text: string } | null;
	order: { k: string; v: string }[];
	timeline: LogEntry[];
	stageChip: Chip;
	side: { k: string; v: string; tone: Tone | 'plain'; href?: string }[];
	notes: { tone: 'orange' | 'red'; text: string }[];
	/** 단계별 버튼 — 회수 확인 · 재발송 송장 입력 · 환불 다시 · 승인/반려 */
	action: 'pickup' | 'resend' | 'refund' | 'decide' | null;
	armed: Armed | null;
}

export interface ClaimModal {
	title: string;
	desc: string;
	info: string;
	ok: string;
	sure?: string;
	options?: { label: string; items: string[]; value: string };
	msg?: { label: string; ph: string; max: number; required: boolean };
	tracking?: { label: string; ph: string };
}

export const CARRIERS = ['CJ대한통운', '한진택배', '롯데택배', '우체국택배'];

const STAGE_CHIP: Record<ClaimStage, Chip> = {
	pending: { label: '처리 대기', tone: 'orange' },
	pickup: { label: '회수 대기', tone: 'orange' },
	resend: { label: '재발송 대기', tone: 'orange' },
	refund: { label: '환불 다시 필요', tone: 'red' },
	done: { label: '완료', tone: 'grey' },
	rejected: { label: '반려', tone: 'grey' }
};
const CLAIM_EMPTY: Record<ClaimTab, string> = {
	pickup: '회수를 기다리는 요청이 없어요',
	resend: '재발송을 기다리는 요청이 없어요',
	refund: '환불을 다시 해야 하는 요청이 없어요',
	pending: '처리를 기다리는 요청이 없어요',
	done: '완료한 요청이 없어요',
	rejected: '반려한 요청이 없어요',
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
	due: '',
	late: 0,
	okAt: null,
	by: null,
	text: '',
	photos: 0,
	msg: null,
	fail: null,
	resent: null,
	tl: [],
	...x
});

const seedClaims = (): ClaimRaw[] => [
	K('R-0312', 'MYR1509', 'c1', 'p1', 1, '환불', '단순 변심', 'pending', '11월 14일', '김*연', {
		due: '11월 16일',
		late: 1,
		text: '생각했던 맛과 달라서 환불하고 싶어요. 한 포만 뜯었어요.',
		photos: 2,
		tl: [L('11월 14일 오전 10:22', '고객이 환불을 요청했어요', '고객'), L('11월 16일 오전 10:22', '크리에이터 답변 기한이 지났어요', '자동')]
	}),
	K('R-0314', 'MYR1512', 'c1', 'p2', 2, '교환', '배송 중 파손', 'pending', '11월 16일', '박*훈', {
		due: '11월 18일',
		text: '박스가 찌그러져서 왔고 스틱 두 포가 터져 있었어요.',
		photos: 3,
		tl: [L('11월 16일 오후 3:40', '고객이 교환을 요청했어요', '고객')]
	}),
	K('R-0309', 'MYR1502', 'c2', 'p5', 1, '환불', '상품 불량', 'pickup', '11월 12일', '신*영', {
		okAt: '11월 13일',
		by: '하루',
		text: '필름이 서로 붙어서 떼어지지 않아요.',
		photos: 2,
		msg: '불편을 드려 죄송해요. 회수 후 바로 환불해 드릴게요.',
		tl: [L('11월 12일 오후 1:05', '고객이 환불을 요청했어요', '고객'), L('11월 13일 오전 9:30', '하루가 승인했어요 · 회수 접수', '크리에이터'), L('11월 14일 오전 9:00', '회수 기사 배정 · CJ대한통운', '자동')]
	}),
	K('R-0307', 'MYR1495', 'c3', 'p7', 1, '교환', '오배송', 'resend', '11월 11일', '고*민', {
		okAt: '11월 12일',
		by: '준',
		text: '바닐라를 주문했는데 초코가 왔어요.',
		photos: 1,
		msg: '바로 바닐라로 다시 보내 드릴게요.',
		tl: [L('11월 11일 오전 11:48', '고객이 교환을 요청했어요', '고객'), L('11월 12일 오후 2:10', '준이 승인했어요', '크리에이터'), L('11월 16일 오후 4:05', '회수 확인', me())]
	}),
	K('R-0305', 'MYR1490', 'c4', 'p9', 2, '환불', '상품 불량', 'refund', '11월 10일', '임*정', {
		okAt: '11월 11일',
		by: '소이',
		text: '캡슐이 녹아서 서로 붙어 있어요.',
		photos: 2,
		msg: '죄송해요, 전액 환불해 드릴게요.',
		fail: '카드사 환불 실패 · 11월 16일 오후 2:11 (카드 유효기간 만료)',
		tl: [
			L('11월 10일 오후 5:20', '고객이 환불을 요청했어요', '고객'),
			L('11월 11일 오전 10:15', '소이가 승인했어요', '크리에이터'),
			L('11월 13일 오후 1:30', '회수 확인', '운영 박서연'),
			L('11월 16일 오후 2:11', '환불 실패 · 카드 유효기간 만료', '자동')
		]
	}),
	K('R-0301', 'MYR1482', 'c5', 'p13', 1, '환불', '단순 변심', 'done', '11월 7일', '차*우', {
		okAt: '11월 8일',
		by: '온유',
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
	})
];

// ───────── 고객 문의 ─────────

export type InquiryStatus = 'open' | 'answered' | 'closed';
export type InquiryTab = 'open' | 'late' | 'answered' | 'closed';

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
	canClose: boolean;
	reply: { title: string; ph: string; max: number; note: string; ok: string };
}

const INQ_EMPTY: Record<InquiryTab, string> = {
	open: '답변을 기다리는 문의가 없어요',
	late: '24시간 넘은 미답변이 없어요',
	answered: '답변 완료한 문의가 없어요',
	closed: '종료한 문의가 없어요'
};
const LATE_MINS = 24 * 60;

const M = (who: 'c' | 'a', text: string, time: string, name: string | null = null, proxy = false): InquiryMsg => ({ who, text, time, name, proxy });
const Q = (id: string, who: string, productId: string, q: string, mins: number, status: InquiryStatus, msgs: InquiryMsg[]): InquiryRaw => ({ id, who, productId, q, mins, status, msgs });

const seedInquiries = (): InquiryRaw[] => [
	Q('Q-2038', '박*훈', 'p5', '임산부도 먹어도 되나요? 성분표를 봐도 잘 모르겠어요.', 26 * 60, 'open', [M('c', '임산부도 먹어도 되나요? 성분표를 봐도 잘 모르겠어요.', '11월 16일 오전 8:14')]),
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
	/** 운영이 처리할 교환 · 환불 — 회수 대기 · 재발송 대기 · 환불 다시 필요(가장 오래된 실패 시각) */
	pickup: number;
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
				n: c.pickup + c.resend + c.refundRetry + c.pending
			},
			{
				key: 'inquiries',
				label: '고객 문의',
				href: '/cs/inquiries',
				n: c.inqOpen
			}
		];
	}

	// ── 교환 · 환불
	claimSummary(): string {
		const c = this.counts;
		return `운영이 처리할 일 ${c.pickup + c.resend + c.refundRetry}건 · 크리에이터 답변 기한 넘김 ${c.creatorLate}건`;
	}

	claimTabs(): { id: ClaimTab; name: string; count: number; hot?: boolean }[] {
		const n = (s: ClaimStage) => this.claimsRaw.filter((k) => k.stage === s).length;
		return [
			{ id: 'pickup', name: '회수 대기', count: n('pickup') },
			{ id: 'resend', name: '재발송 대기', count: n('resend') },
			{ id: 'refund', name: '환불할 차례', count: n('refund'), hot: true },
			{ id: 'pending', name: '처리 대기', count: n('pending') },
			{ id: 'done', name: '완료', count: n('done') },
			{ id: 'rejected', name: '반려', count: n('rejected') },
			{ id: 'all', name: '전체', count: this.claimsRaw.length }
		];
	}

	claims({ tab, q }: { tab: ClaimTab; q: string }): {
		rows: ClaimRow[];
		empty: string;
	} {
		const needle = q.trim().toLowerCase();
		const rows = this.claimsRaw
			.filter((k) => tab === 'all' || k.stage === tab)
			.map((k): ClaimRow & { txt: string } => {
				const p = productOf(k.productId);
				const x = creatorOf(k.creatorId);
				return {
					id: k.id,
					thumb: { tile: p.tile, icon: p.icon },
					chips: [{ label: k.kind, tone: 'plain' }, STAGE_CHIP[k.stage]],
					meta: `${k.id} · ${k.ord} · ${k.at} 접수`,
					title: `${p.name} × ${k.qty}`,
					sub: `${x.name} · ${k.why}${k.by ? ` · ${k.okAt} ${k.by} ${k.stage === 'rejected' ? '반려' : '승인'}` : ''}`,
					right: won(p.price * k.qty),
					rightSub: k.stage === 'pending' ? (k.late ? `답변 기한 ${k.late}일 지남` : `${k.due}까지 답변`) : '',
					rightSubTone: k.late ? 'red' : 'grey',
					txt: `${k.id} ${k.ord} ${p.name} ${x.name} ${k.why}`.toLowerCase()
				};
			})
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

	claim(id: string): ClaimView | null {
		const k = this.rawClaim(id);
		if (!k) return null;
		const p = productOf(k.productId);
		const x = creatorOf(k.creatorId);
		const amount = won(this.amountOf(k));
		const side: ClaimView['side'] = [
			{ k: '요청번호', v: k.id, tone: 'plain' },
			{
				k: '크리에이터',
				v: `${x.name} ${x.handle}`,
				tone: 'plain',
				href: `/creators?id=${x.id}`
			},
			{ k: '고객', v: k.who, tone: 'plain' },
			{ k: '접수', v: k.at, tone: 'plain' },
			k.okAt
				? { k: '승인', v: `${k.okAt} · ${k.by}`, tone: 'plain' }
				: {
						k: '답변 기한',
						v: k.late ? `${k.due}까지 · ${k.late}일 지남` : `${k.due}까지`,
						tone: k.late ? 'red' : 'plain'
					}
		];
		const notes: ClaimView['notes'] = [];
		let armed: Armed | null = null;
		let action: ClaimView['action'] = null;
		if (k.stage === 'pickup') {
			action = 'pickup';
			armed = {
				label: '회수 확인',
				sure: '정말 회수 확인하기',
				note: k.kind === '환불' ? `회수를 확인하면 바로 환불돼요 · ${amount}` : '회수를 확인하면 재발송 대기로 넘어가요'
			};
		} else if (k.stage === 'resend') action = 'resend';
		else if (k.stage === 'refund') {
			action = 'refund';
			notes.push({ tone: 'red', text: k.fail ?? '' });
			armed = {
				label: '환불 다시',
				sure: '정말 환불 다시 하기',
				note: `결제 수단으로 ${amount}을 다시 환불해요`
			};
		} else if (k.stage === 'pending') {
			action = 'decide';
			notes.push({ tone: 'orange', text: PROXY_NOTE });
		}
		return {
			id: k.id,
			tab: k.stage,
			stage: k.stage,
			title: `${k.id} · ${k.kind} 요청`,
			sub: `${k.ord} · ${p.name} × ${k.qty}`,
			thumb: { tile: p.tile, icon: p.icon },
			amount,
			request: {
				chip: { label: `${k.kind} · ${k.why}`, tone: 'plain' },
				text: k.text
			},
			photos: Array.from({ length: k.photos }, (_, i) => ({
				label: `사진 ${i + 1}`,
				bg: PHOTO_BG[i % PHOTO_BG.length]
			})),
			photosTitle: `고객 사진 ${k.photos}장`,
			message: k.msg ? { title: `${k.by ?? x.name} 메시지`, text: k.msg } : null,
			order: [{ k: '주문번호', v: k.ord }, { k: '상품', v: `${p.name} × ${k.qty}` }, { k: '환불 대상 금액', v: amount }, ...(k.resent ? [{ k: '재발송 송장', v: k.resent }] : [])],
			timeline: k.tl,
			stageChip: STAGE_CHIP[k.stage],
			side,
			notes,
			action,
			armed
		};
	}

	/** 모달 문구(시안 modalDef · claimOk · claimNo · resend) */
	claimModal(id: string, which: 'approve' | 'reject' | 'resend'): ClaimModal | null {
		const k = this.rawClaim(id);
		if (!k) return null;
		const desc = `${k.id} · ${productOf(k.productId).name} × ${k.qty}`;
		if (which === 'resend')
			return {
				title: '재발송 송장 입력',
				desc,
				info: '저장하면 교환이 완료되고 고객에게 운송장을 알려요',
				ok: '송장 저장',
				options: { label: '택배사', items: CARRIERS, value: CARRIERS[0] },
				tracking: { label: '운송장', ph: '숫자와 - 만 입력' }
			};
		if (which === 'approve')
			return {
				title: '승인',
				desc,
				info: PROXY_NOTE,
				ok: '승인',
				sure: '정말 승인하기',
				options: {
					label: '처리 방법',
					items: ['환불', '교환(재발송)'],
					value: k.kind === '환불' ? '환불' : '교환(재발송)'
				},
				msg: {
					label: '고객에게 보낼 메시지 (선택)',
					ph: '비워 두면 기본 안내가 나가요',
					max: 300,
					required: false
				}
			};
		return {
			title: '반려',
			desc,
			info: PROXY_NOTE,
			ok: '반려',
			sure: '정말 반려하기',
			msg: {
				label: '고객에게 보낼 메시지',
				ph: '반려하는 이유를 고객에게 알려 주세요',
				max: 300,
				required: true
			}
		};
	}

	private patchClaim(id: string, fn: (k: ClaimRaw) => Partial<ClaimRaw>) {
		this.claimsRaw = this.claimsRaw.map((k) => (k.id === id ? { ...k, ...fn(k) } : k));
	}

	/** [회수 확인] — 환불이면 바로 환불 · 교환이면 재발송 대기로 */
	confirmPickup(id: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pickup') return noR('회수를 기다리는 요청이 아니에요');
		const amount = won(this.amountOf(k));
		const refund = k.kind === '환불';
		this.patchClaim(id, (o) => ({
			stage: refund ? 'done' : 'resend',
			tl: [...o.tl, L(stamp(), refund ? `회수 확인 · 환불 완료 ${amount}` : '회수 확인', me())]
		}));
		return okR(refund ? `회수 확인 · ${amount} 환불했어요` : '회수를 확인했어요 · 재발송 송장을 입력해 주세요');
	}

	/** [재발송 송장 입력] — 택배사 · 운송장(숫자와 - · 8자리 이상) → 교환 완료 */
	resend(id: string, carrier: string, tracking: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'resend') return noR('재발송을 기다리는 요청이 아니에요');
		if (!CARRIERS.includes(carrier)) return noR('택배사를 골라 주세요');
		const tr = tracking.trim();
		if (!/^[\d-]{8,}$/.test(tr)) return noR('운송장 번호를 확인해 주세요 — 숫자 8자리 이상');
		const r = `${carrier} ${tr}`;
		this.patchClaim(id, (o) => ({
			stage: 'done',
			resent: r,
			tl: [...o.tl, L(stamp(), `재발송 · ${r}`, me())]
		}));
		return okR('재발송 송장을 저장했어요 · 교환을 완료했어요');
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

	/** [승인] — 운영 대행 · 처리 방법(환불 · 교환(재발송)) · 메시지는 선택 → 회수 대기 */
	approve(id: string, how: string, msg: string): Result {
		const k = this.rawClaim(id);
		if (!k || k.stage !== 'pending') return noR('처리를 기다리는 요청이 아니에요');
		if (!['환불', '교환(재발송)'].includes(how)) return noR('처리 방법을 골라 주세요');
		const m = msg.trim();
		if (m.length > 300) return noR('메시지는 300자까지 적을 수 있어요');
		this.patchClaim(id, (o) => ({
			stage: 'pickup',
			kind: how === '환불' ? '환불' : '교환',
			okAt: '11월 17일',
			by: me(),
			late: 0,
			msg: m || '회수 후 바로 처리해 드릴게요.',
			tl: [...o.tl, L(stamp(), '승인 · 회수 접수 (운영 대행)', me())]
		}));
		return okR('승인했어요 · 회수 대기로 넘어갔어요');
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

	// ── 고객 문의
	inquirySummary(): string {
		const c = this.counts;
		return `답변 대기 ${c.inqOpen}건 · 24시간 넘은 미답변 ${c.inqLate}건`;
	}

	inquiryTabs(): {
		id: InquiryTab;
		name: string;
		count: number;
		hot?: boolean;
	}[] {
		const open = this.inquiriesRaw.filter((q) => q.status === 'open');
		const n = (s: InquiryStatus) => this.inquiriesRaw.filter((q) => q.status === s).length;
		return [
			{ id: 'open', name: '답변 대기', count: open.length },
			{
				id: 'late',
				name: '24시간 넘은 미답변',
				count: open.filter((q) => q.mins >= LATE_MINS).length,
				hot: true
			},
			{ id: 'answered', name: '답변 완료', count: n('answered') },
			{ id: 'closed', name: '종료', count: n('closed') }
		];
	}

	private inqChip(q: InquiryRaw): Chip {
		if (q.status === 'open') {
			const late = q.mins >= LATE_MINS;
			return {
				label: late ? `${ago(q.mins)} · 24시간 넘음` : ago(q.mins),
				tone: late ? 'red' : 'mint'
			};
		}
		return {
			label: q.status === 'answered' ? '답변 완료' : '종료',
			tone: 'grey'
		};
	}

	inquiries({ tab, q }: { tab: InquiryTab; q: string }): {
		rows: InquiryRow[];
		empty: string;
	} {
		const needle = q.trim().toLowerCase();
		const inTab = (i: InquiryRaw) => (tab === 'late' ? i.status === 'open' && i.mins >= LATE_MINS : i.status === tab);
		const rows = this.inquiriesRaw
			.filter(inTab)
			.map((i): InquiryRow & { txt: string } => {
				const p = productOf(i.productId);
				const x = creatorOf(p.creatorId);
				return {
					id: i.id,
					thumb: { tile: p.tile, icon: p.icon },
					chips: [this.inqChip(i)],
					meta: `${i.id} · ${i.who}${i.status === 'open' ? '' : ` · ${ago(i.mins)}`}`,
					title: i.q,
					sub: `${p.name} · ${x.name}`,
					txt: `${i.id} ${i.who} ${p.name} ${i.q} ${x.name}`.toLowerCase()
				};
			})
			.filter((r) => !needle || r.txt.includes(needle));
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
			tab: i.status === 'open' && i.mins >= LATE_MINS ? 'late' : i.status,
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
					href: `/creators?id=${x.id}`
				}
			],
			canReply: i.status !== 'closed',
			canClose: i.status !== 'closed',
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
		if (!i || i.status === 'closed') return noR('종료한 문의에는 답변할 수 없어요');
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

	/** [종료] */
	closeInquiry(id: string): Result {
		const i = this.rawInquiry(id);
		if (!i || i.status === 'closed') return noR('이미 종료한 문의예요');
		this.patchInquiry(id, () => ({ status: 'closed', mins: 0 }));
		return okR('문의를 종료했어요');
	}
}

export const cs = new CsServer();
