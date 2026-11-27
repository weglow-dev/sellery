/** 정산(docs/myr-admin-screens.md §10) 서버 흉내 — 제조 원장(상품별 제조 차수 · 보증금) · 월 정산 회차(10월분 · 11월 1일 오후 1시 자동 확정).
 *  판매가의 60% 가 정산금 · 상품별 남은 제조금액을 먼저 빼고(상계 = min(정산금, 남은 제조금액)) · 다 갚으면 보증금(제조금액의 25%)을 그 정산에서 돌려준다 · 원장이 없는 상품은 보류.
 *  10월분 줄의 크리에이터별 지급액 합은 seed.ts seedPayouts() 의 지급 건 금액과 같다(지급 화면과 같은 숫자 · c4 만 줄 단위가 ±₩100 다르다 — 보류 해제 줄은 수학적으로 ₩21,500 이 나올 수 없다).
 *  화면은 여기서 받은 칩 · 문구 · 버튼 · 건수만 그린다. server.svelte.ts(지급 건 상태)는 메서드 안에서만 읽는다 — server 가 이 모듈을 다시 가져와도(순환) 모듈 평가 때는 건드리지 않는다. */
import { PRODUCTS, creatorOf, productOf, type CatalogProduct } from './catalog';
import { ME } from './seed';
// 지급 건 상태(server.payouts)는 메서드 안에서만 읽는다 — server.svelte.ts 가 이 모듈을 가져와도(순환) 모듈 평가 때는 쓰지 않아 안전
import { server } from './server.svelte';
import type { Chip, Tone } from './types';

const won = (n: number) => `${n < 0 ? '−₩' : '₩'}${Math.abs(n).toLocaleString('ko-KR')}`;
/** 목의 오늘(seed.ts NOW · 11월 17일) — 보증금 입금 확인일 거절 */
const TODAY = '2026-11-17';
const NEXT_AT = '12월 1일(화) 오후 1시';
const NEXT_DAY = '12월 1일';
const DDAY = 14;
const me = () => `${ME.role} ${ME.name}`;
const fd = (iso: string) => {
	const [, m, d] = iso.split('-').map(Number);
	return `${m}월 ${d}일`;
};
const chip = (label: string, tone: Tone): Chip => ({ label, tone });

// ───────── 모양 ─────────

export interface LedgerRound {
	n: number;
	amount: number;
	/** 입력일(시안 "입력일") — 보증금은 제조금액을 입력할 때 운영이 따로 받아 둔다(입금 확인 단계 없음 · 2026-11-27) */
	depositAt: string;
	refunded: boolean;
	memo: string;
	by: string;
	void: boolean;
}
export interface LedgerRaw {
	productId: string;
	rounds: LedgerRound[];
	/** 지금까지 상계한 금액(10월분 포함) */
	offset: number;
}
/** 10월분 회차 줄 — 서버가 계산해 둔 값(판매 · 정산 뒤 환불 · 남은 제조금액(전) · 상계 · 보증금 환급) */
export interface SettleLineRaw {
	creatorId: string;
	productId: string;
	/** "10월분" · "9월분 · 보류 해제" */
	month: string;
	sale: number;
	refund: number;
	before: number;
	offset: number;
	dep: number;
	hold: boolean;
	/** 보류 뒤 제조금액을 입력해 보류 확정(다음 정산에서 지급) */
	fixed: boolean;
}
export interface SettleLine extends SettleLineRaw {
	settle: number;
	after: number;
	pay: number;
	tax: number;
}

/** 상세 안 격자 표 — 셀 색 · 굵기 · 아래 글자 · 줄 긋기 · 펼치는 내용까지 서버 값 */
export interface TableCell {
	t: string;
	tone?: Tone | 'dim';
	w?: 'semi' | 'bold' | 'black';
	sub?: string;
	subTone?: Tone;
	chips?: Chip[];
}
export interface TableRow {
	cells: TableCell[];
	strike?: boolean;
	subs?: { t: string; v: string }[];
}
export interface SettleTable {
	title: string;
	/** CSS grid-template-columns */
	cols: string;
	/** 모바일 가로 스크롤 최소 폭 */
	minW: number;
	head: { label: string; right?: boolean }[];
	rows: TableRow[];
	empty?: string;
}

export type LedgerTab = 'all' | 'repay' | 'done' | 'none';
export interface LedgerRow {
	id: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	title: string;
	sub: string;
	bar?: { pct: number; text: string };
	right?: string;
	rightTone: 'plain' | 'grey';
	rightSub?: string;
	/** 원장이 있으면 상세 주소 · 없으면 제조금액 입력 모달(+ 줄의 [제조금액 입력]) */
	href: string | null;
}
export interface LedgerDetail {
	id: string;
	thumb: { tile: string; icon: string };
	title: string;
	sub: string;
	chips: Chip[];
	stats: { k: string; v: string; tone?: Tone | 'plain' }[];
	bar: { pct: number; text: string };
	tables: SettleTable[];
	side: { product: string; creator: string; status: Chip };
	note: string;
	can: { fix: boolean; void: boolean };
}
export interface RoundRow {
	month: string;
	tileText: string;
	chips: Chip[];
	meta: string;
	title: string;
	sub: string;
	bar: { pct: number; text: string };
	right: string;
	rightSub: string;
	href: string | null;
}
export interface RoundDetail {
	month: string;
	title: string;
	sub: string;
	/** op — 값 앞 연산 기호(− + =) · note — 값 아래 작은 글씨(지급 합계 "(환불 차감 −₩…)" · 지난 회차 정산 뒤 환불) */
	stats: { k: string; v: string; tone?: Tone | 'plain'; op?: string; note?: string }[];
	bar: { pct: number; text: string };
	groups: { creatorId: string; name: string; handle: string; chips: Chip[]; payoutHref: string; table: SettleTable }[];
}

type Result = { ok: boolean; msg: string };

// ───────── 시드 ─────────

const R = (n: number, amount: number, depositAt: string, refunded: boolean, memo: string, by: string): LedgerRound => ({ n, amount, depositAt, refunded, memo, by, void: false });
/** 상품별 원장 — p6 · p16 · p19 · p35 는 일부러 없다(보류 2건 · 원장 없는 판매 상품 2개) */
const seedLedgers = (): LedgerRaw[] => [
	{ productId: 'p1', rounds: [R(1, 600000, '9월 20일', true, '초도 3,000포', '운영 박서연')], offset: 600000 },
	{ productId: 'p2', rounds: [R(1, 200000, '10월 2일', true, '초도 1,000포', '운영 김지수')], offset: 200000 },
	{ productId: 'p3', rounds: [R(1, 400000, '', false, '초도 2,000포', '운영 김지수')], offset: 0 },
	{ productId: 'p5', rounds: [R(1, 700000, '9월 25일', true, '초도 2,000매', '운영 김지수')], offset: 700000 },
	{ productId: 'p7', rounds: [R(1, 150000, '9월 8일', true, '초도 1,000포', '운영 박서연')], offset: 150000 },
	{ productId: 'p8', rounds: [R(1, 300000, '9월 2일', true, '', '운영 박서연'), R(2, 200000, '10월 28일', false, '재생산 1,000포', '운영 김지수')], offset: 380000 },
	{ productId: 'p9', rounds: [R(1, 120000, '9월 12일', true, '초도 600캡슐', '운영 박서연')], offset: 120000 },
	{ productId: 'p10', rounds: [R(1, 52800, '10월 7일', true, '초도 800개 · 9월분 보류 뒤 입력', '운영 김지수')], offset: 52800 },
	{ productId: 'p12', rounds: [R(1, 300000, '9월 11일', true, '초도 1,500포', '운영 김지수')], offset: 300000 },
	{ productId: 'p13', rounds: [R(1, 200000, '10월 24일', false, '초도 1,000포', '운영 김지수')], offset: 0 },
	{ productId: 'p14', rounds: [R(1, 160000, '9월 18일', true, '초도 800포', '운영 박서연')], offset: 160000 },
	{ productId: 'p15', rounds: [R(1, 240000, '9월 22일', true, '초도 1,200포', '운영 박서연')], offset: 240000 },
	{ productId: 'p17', rounds: [R(1, 200000, '9월 10일', true, '초도 1,000포', '운영 박서연')], offset: 200000 },
	{ productId: 'p18', rounds: [R(1, 120000, '9월 26일', true, '초도 600포', '운영 김지수')], offset: 120000 },
	{ productId: 'p20', rounds: [R(1, 400000, '9월 5일', true, '초도 2,000포', '운영 박서연')], offset: 400000 },
	{ productId: 'p21', rounds: [R(1, 150000, '10월 1일', true, '초도 800포', '운영 김지수')], offset: 150000 },
	{ productId: 'p22', rounds: [R(1, 100000, '8월 20일', true, '초도 500포', '운영 박서연')], offset: 100000 },
	{ productId: 'p23', rounds: [R(1, 150000, '9월 30일', true, '초도 500개', '운영 김지수')], offset: 150000 },
	{ productId: 'p24', rounds: [R(1, 180000, '10월 2일', true, '초도 900포', '운영 김지수')], offset: 180000 },
	{ productId: 'p25', rounds: [R(1, 120000, '', false, '초도 600포', '운영 김지수')], offset: 0 },
	{ productId: 'p26', rounds: [R(1, 200000, '10월 4일', false, '초도 1,000포', '운영 김지수')], offset: 158000 },
	{ productId: 'p27', rounds: [R(1, 160000, '10월 7일', true, '초도 1,000매', '운영 김지수')], offset: 160000 },
	{ productId: 'p29', rounds: [R(1, 140000, '10월 10일', true, '초도 1,000포', '운영 김지수')], offset: 140000 },
	{ productId: 'p30', rounds: [R(1, 120000, '10월 12일', true, '초도 600개', '운영 박서연')], offset: 120000 },
	{ productId: 'p31', rounds: [R(1, 80000, '10월 15일', true, '초도 400포', '운영 김지수')], offset: 80000 },
	{ productId: 'p32', rounds: [R(1, 60000, '10월 9일', true, '초도 300병', '운영 박서연')], offset: 60000 },
	{ productId: 'p33', rounds: [R(1, 90000, '10월 4일', true, '초도 1,000구미', '운영 김지수')], offset: 90000 },
	{ productId: 'p36', rounds: [R(1, 120000, '10월 7일', true, '초도 600포', '운영 김지수')], offset: 120000 },
	{ productId: 'p37', rounds: [R(1, 140000, '10월 10일', true, '초도 500병', '운영 김지수')], offset: 140000 },
	{ productId: 'p38', rounds: [R(1, 100000, '10월 20일', false, '초도 1,000구미', '운영 박서연')], offset: 0 },
	{ productId: 'p39', rounds: [R(1, 120000, '10월 28일', false, '초도 600포', '운영 김지수')], offset: 0 }
];

const L = (creatorId: string, productId: string, sale: number, refund: number, before: number, offset: number, dep: number, x: Partial<SettleLineRaw> = {}): SettleLineRaw => ({ creatorId, productId, month: '10월분', sale, refund, before, offset, dep, hold: false, fixed: false, ...x });
/** 10월분 회차 줄 — 크리에이터별 지급액 합 = seedPayouts() 금액 */
const seedLines = (): SettleLineRaw[] => [
	L('c1', 'p1', 448000, 0, 150400, 150400, 150000),
	L('c1', 'p2', 216000, 0, 35200, 35200, 50000),
	L('c2', 'p5', 310000, 0, 0, 0, 0),
	L('c2', 'p6', 264000, 0, 0, 0, 0, { hold: true }),
	L('c3', 'p7', 203000, 23400, 0, 0, 0),
	L('c4', 'p9', 120000, 0, 49500, 49500, 30000),
	L('c4', 'p10', 102000, 0, 52800, 52800, 13200, { month: '9월분 · 보류 해제' }),
	L('c5', 'p12', 420000, 0, 88500, 88500, 75000),
	L('c6', 'p14', 232000, 0, 26900, 26900, 40000),
	L('c7', 'p15', 216000, 0, 0, 0, 0),
	L('c8', 'p17', 232000, 0, 46900, 46900, 50000),
	L('c8', 'p18', 132000, 0, 45800, 45800, 30000),
	L('c8', 'p19', 189000, 0, 0, 0, 0, { hold: true }),
	L('c9', 'p20', 389000, 22800, 0, 0, 0),
	L('c9', 'p21', 156000, 0, 23500, 23500, 37500),
	L('c10', 'p23', 145500, 0, 0, 0, 0),
	L('c11', 'p24', 224000, 0, 14500, 14500, 45000),
	L('c12', 'p26', 180000, 0, 150000, 108000, 0),
	L('c13', 'p27', 224000, 0, 31400, 31400, 40000),
	L('c14', 'p29', 144000, 0, 24600, 24600, 35000),
	L('c15', 'p30', 156000, 0, 22400, 22400, 30000),
	L('c15', 'p31', 93000, 0, 23500, 23500, 20000),
	L('c16', 'p32', 84000, 0, 6500, 6500, 15000),
	L('c17', 'p33', 187000, 0, 0, 0, 0),
	L('c20', 'p36', 224500, 0, 0, 0, 0),
	L('c21', 'p37', 152000, 0, 0, 0, 0)
];

/** 9월분 회차 — 시안에는 10월분 상세만 있어 목록 줄만 고정값 */
const SEPT = { lines: 9, settle: 1862400, offset: 1204800, dep: 250000, pay: 907600, paidN: 6, payN: 6 };

const STATUS_CHIP: Record<CatalogProduct['status'], Chip> = {
	draft: chip('작성 중', 'grey'),
	review: chip('심사 대기', 'orange'),
	live: chip('판매 중', 'mint'),
	paused: chip('일시중지', 'grey'),
	rejected: chip('반려', 'red'),
	ended: chip('판매 종료', 'grey')
};

const LEDGER_COLS = { rounds: '44px 92px 72px minmax(0,1fr) 100px 100px', offsets: '90px minmax(0,1fr) 120px 130px' };
const ROUND_COLS = 'minmax(170px,1.6fr) 100px 100px 96px 100px 196px 100px 108px';

class SettleServer {
	ledgersRaw = $state<LedgerRaw[]>(seedLedgers());
	linesRaw = $state<SettleLineRaw[]>(seedLines());

	// ───────── 판정(서버 함수 자리) ─────────

	private ledgerOf(productId: string) {
		return this.ledgersRaw.find((l) => l.productId === productId) ?? null;
	}
	private calc(l: SettleLineRaw): SettleLine {
		const settle = Math.round(l.sale * 0.6);
		return { ...l, settle, after: l.before - l.offset, pay: l.hold ? 0 : settle - l.refund - l.offset + l.dep, tax: l.hold ? 0 : settle - l.refund - l.offset };
	}
	get lines(): SettleLine[] {
		return this.linesRaw.map((l) => this.calc(l));
	}
	/** 아직 제조금액을 안 넣어 보류가 안 풀린 줄 */
	private get heldOpen() {
		return this.lines.filter((l) => l.hold && !l.fixed);
	}
	/** 원장이 있는 상품 — 살아 있는 차수(무효 제외)로 합 · 남은 금액 · 보증금 칩 */
	private led(productId: string) {
		const l = this.ledgerOf(productId);
		if (!l) return null;
		const live = l.rounds.filter((r) => !r.void);
		const total = live.reduce((a, r) => a + r.amount, 0);
		const remain = Math.max(0, total - l.offset);
		// 보증금은 제조금액을 입력할 때 운영이 따로 받아 둔다 — 입력하면 바로 보관 중 · 다 갚으면 환급 완료(시안 · 입금 확인 단계 없음)
		const keep = live.some((r) => !r.refunded);
		return {
			raw: l,
			rounds: l.rounds,
			total,
			offset: l.offset,
			remain,
			pct: total ? Math.round((l.offset / total) * 100) : 0,
			dep: live.reduce((a, r) => a + r.amount * 0.25, 0),
			st: (remain ? 'repay' : 'done') as 'repay' | 'done',
			stChip: remain ? chip('상환 중', 'orange') : chip('상환 완료', 'grey'),
			depChip: keep ? chip('보증금 보관 중', 'orange') : chip('보증금 환급 완료', 'grey')
		};
	}
	/** 원장 화면이 다루는 상품 — 판매 중 · 일시중지 · (원장이 있는) 판매 종료 */
	private get scope() {
		return PRODUCTS.filter((p) => p.status === 'live' || p.status === 'paused' || (p.status === 'ended' && !!this.ledgerOf(p.id)));
	}
	/** 판매 중인데 원장이 없는 상품(보류된 줄이 있는 상품은 보류 묶음에서) */
	private get noLedger() {
		const held = this.heldOpen;
		return PRODUCTS.filter((p) => p.status === 'live' && !this.ledgerOf(p.id) && !held.some((l) => l.productId === p.id));
	}
	private thumb(p: CatalogProduct) {
		return { tile: p.tile, icon: p.icon };
	}

	// ───────── 홈 · 메뉴 숫자 ─────────

	get counts() {
		return { noLedger: this.noLedger.length, heldLines: this.heldOpen.length, noMfg: this.scope.filter((p) => !this.led(p.id)).length, nextAt: NEXT_AT, dday: DDAY };
	}

	// ───────── 제조 원장 목록 ─────────

	get summary() {
		return `다음 정산 ${NEXT_DAY} 오후 1시 · D-${DDAY}`;
	}

	ledgerTabs(): { id: LedgerTab; name: string; count: number; hot?: boolean }[] {
		const all = this.scope.map((p) => this.led(p.id));
		const n = (f: (x: ReturnType<SettleServer['led']>) => boolean) => all.filter(f).length;
		return [
			{ id: 'repay', name: '상환 중', count: n((x) => x?.st === 'repay') },
			{ id: 'done', name: '상환 완료', count: n((x) => x?.st === 'done') },
			{ id: 'none', name: '제조금액 없음', count: n((x) => !x), hot: true },
			{ id: 'all', name: '전체', count: all.length }
		];
	}

	ledgerList({ tab, q }: { tab: LedgerTab; q: string }): LedgerRow[] {
		const needle = q.trim().toLowerCase();
		return this.scope
			.map((p) => ({ p, l: this.led(p.id), c: creatorOf(p.creatorId) }))
			.filter(({ l }) => (tab === 'all' ? true : tab === 'none' ? !l : l?.st === tab))
			.filter(({ p, c }) => !needle || `${p.name} ${c.name} ${c.handle}`.toLowerCase().includes(needle))
			.map(({ p, l, c }) =>
				l
					? {
							id: p.id,
							thumb: this.thumb(p),
							chips: [l.stChip, l.depChip],
							title: p.name,
							sub: `${c.name} · 제조금액 ${won(l.total)} · 상계 ${won(l.offset)}`,
							bar: { pct: l.pct, text: `${l.pct}%` },
							right: won(l.remain),
							rightTone: l.remain ? 'plain' : 'grey',
							rightSub: '남은 제조금액',
							href: `/settle/ledger/${p.id}`
						}
					: {
							id: p.id,
							thumb: this.thumb(p),
							chips: [chip('제조금액 확인 중', 'red')],
							title: p.name,
							sub: ((h) => (h ? `${c.name} · 제조금액이 없어요 · 10월분 정산금 ${won(h.settle)} 보류 중` : `${c.name} · 제조금액이 없어요 · 정산이 보류돼요`))(this.heldOpen.find((x) => x.productId === p.id)),
							rightTone: 'grey',
							href: null
						}
			);
	}

	/** 제조금액 없음 탭 위 주황 띠(시안 — 위쪽 알림 카드는 없앴다 · 제조금액이 없는 상품은 이 탭에서 한 번만) */
	ledgerBand(tab: LedgerTab): string | null {
		return tab === 'none' && this.scope.some((p) => !this.led(p.id)) ? '제조금액이 입력되지 않으면 정산이 보류돼요 · 정산일 전에 입력하면 다음 정산에서 지급돼요' : null;
	}

	// ───────── 제조 원장 상세 ─────────

	ledger(productId: string): LedgerDetail | null {
		const p = PRODUCTS.find((x) => x.id === productId);
		const l = p && this.led(p.id);
		if (!p || !l) return null;
		const c = creatorOf(p.creatorId);
		const ln = this.lines.find((x) => x.productId === p.id && !x.hold);
		const prev = l.offset - (ln?.offset ?? 0);
		const rounds: SettleTable = {
			title: '제조 차수',
			cols: LEDGER_COLS.rounds,
			minW: 600,
			head: [{ label: '차수' }, { label: '입금 확인일' }, { label: '환급' }, { label: '메모 · 입력자' }, { label: '제조금액', right: true }, { label: '보증금 (25%)', right: true }],
			rows: l.rounds.map((r) => ({
				strike: r.void,
				cells: [{ t: `${r.n}차` }, r.depositAt ? { t: r.depositAt } : { t: '확인 전', tone: 'red' }, r.void ? { t: '무효', tone: 'dim' } : r.refunded ? { t: '환급 완료' } : { t: '보관 중', tone: 'grey' }, { t: `${r.memo || '메모 없음'} · ${r.by.replace('운영 ', '')}`, tone: 'grey' }, { t: won(r.amount), w: 'bold' }, { t: won(r.amount * 0.25) }]
			}))
		};
		const offsets: SettleTable = {
			title: '상계 이력',
			cols: LEDGER_COLS.offsets,
			minW: 520,
			head: [{ label: '정산월' }, { label: '내용' }, { label: '상계', right: true }, { label: '남은 제조금액', right: true }],
			rows: [...(ln && ln.offset ? [{ cells: [{ t: '10월분' }, { t: '정산금에서 상계', tone: 'grey' as const }, { t: won(ln.offset), w: 'semi' as const }, { t: won(ln.after) }] }] : []), ...(prev > 0 ? [{ cells: [{ t: '9월분까지' }, { t: '정산금에서 상계', tone: 'grey' as const }, { t: won(prev), w: 'semi' as const }, { t: won(l.total - prev) }] }] : [])],
			empty: '아직 상계한 금액이 없어요 · 첫 정산에서 상계가 시작돼요'
		};
		const hasLive = l.rounds.some((r) => !r.void);
		return {
			id: p.id,
			thumb: this.thumb(p),
			title: p.name,
			sub: `${c.name} · 제조 원장`,
			chips: [l.stChip, l.depChip],
			stats: [
				{ k: '제조금액 합', v: won(l.total) },
				{ k: '상계한 금액', v: won(l.offset) },
				{ k: '남은 제조금액', v: won(l.remain), tone: l.remain ? 'orange' : 'plain' },
				{ k: '보증금 (25%)', v: won(l.dep) }
			],
			bar: { pct: l.pct, text: `${l.pct}% 상계 · ${l.remain ? '상환 중' : '상환 완료'}` },
			tables: [rounds, offsets],
			side: { product: p.name, creator: `${c.name} ${c.handle}`, status: STATUS_CHIP[p.status] },
			note: '제조금액은 매달 정산금에서 상계해요 · 다 갚으면 보증금을 그 정산에서 돌려줘요',
			can: { fix: hasLive, void: hasLive }
		};
	}

	// ───────── 모달 문구(시안 modalDef) ─────────

	/** [제조금액 입력](원장 없음) · [제조 차수 추가] — 같은 모달. amount 는 입력 중인 값(보증금 힌트) */
	amountModal(productId: string, amount: number) {
		const p = productOf(productId);
		const l = this.ledgerOf(p.id);
		const isNew = !l;
		const held = this.heldOpen.find((x) => x.productId === p.id) ?? null;
		const nth = l ? l.rounds.length + 1 : 1;
		return {
			title: isNew ? '제조금액 입력' : '제조 차수 추가',
			desc: `${p.name} · ${creatorOf(p.creatorId).name} · ${nth}차`,
			hint: amount ? `보증금 (25%) ${won(amount * 0.25)} · 입력하면 바로 보관 중으로 기록돼요` : '보증금은 제조금액의 25%로 자동 계산해요',
			info: held ? `보류된 10월분 정산금 ${won(held.settle)}은 다음 정산(${NEXT_DAY})에서 지급돼요` : isNew ? '다음 정산부터 정산금에서 상계가 시작돼요' : '남은 제조금액에 더해져요 · 다음 정산부터 상계해요',
			ok: held ? '보류 확정' : isNew ? '원장 만들기' : '차수 추가'
		};
	}
	depositModal(productId: string) {
		const p = productOf(productId);
		const r = this.ledgerOf(p.id)?.rounds.find((x) => !x.void && !x.depositAt);
		if (!r) return null;
		return { title: '보증금 입금 확인', desc: `${p.name} · ${r.n}차 보증금 ${won(r.amount * 0.25)}`, today: TODAY, ok: '입금 확인' };
	}
	/** [금액 정정] · [무효] — 마지막 살아 있는 차수가 대상 */
	roundModal(productId: string, kind: 'fix' | 'void') {
		const p = productOf(productId);
		const r = [...(this.ledgerOf(p.id)?.rounds ?? [])].reverse().find((x) => !x.void);
		if (!r) return null;
		return kind === 'fix'
			? { title: '금액 정정', desc: `${p.name} · ${r.n}차 ${won(r.amount)}`, placeholder: r.amount.toLocaleString('ko-KR'), why: '왜 정정하는지 적어 주세요', info: '정정하면 보증금과 남은 제조금액을 다시 계산해요', warn: null, ok: '정정', sure: null }
			: { title: '무효', desc: `${p.name} · ${r.n}차 ${won(r.amount)}`, placeholder: '', why: '왜 무효로 하는지 적어 주세요', info: null, warn: '무효로 한 차수는 줄을 그어 남기고 계산에서 빠져요', ok: '무효', sure: '정말 무효로 하기' };
	}
	get runModal() {
		// 시안 — 고를 수 있는 달이 아직 안 끝났으면 빨간 안내를 먼저 보여 주고 [실행]은 잠근다
		return { title: '회차 수동 실행', desc: '자동 계산이 실패했을 때만 써요', months: ['11월분'], info: '회차는 매월 1일 오후 1시에 자동으로 계산하고 확정해요', warn: '11월분은 아직 끝나지 않았어요 — 12월 1일 오후 1시부터 실행할 수 있어요', ok: '실행', canRun: false };
	}

	// ───────── 월 정산 회차 ─────────

	private get payouts() {
		// 지급 건 상태는 지급 서버가 판정한다 — 모듈 평가 때가 아니라 여기서만 읽는다(순환 import 안전)
		return server.payouts;
	}
	private get octTotals() {
		const live = this.lines.filter((l) => !l.hold);
		const tot = (k: 'settle' | 'refund' | 'offset' | 'dep' | 'pay') => live.reduce((a, l) => a + l[k], 0);
		const pays = this.payouts.filter((p) => p.amount);
		const paid = pays.filter((p) => p.paid);
		return { tot, pays, paid, paidSum: paid.reduce((a, p) => a + p.amount, 0), pct: pays.length ? Math.round((paid.length / pays.length) * 100) : 0 };
	}

	get roundsSummary() {
		return '매월 1일 오후 1시에 자동으로 계산하고 확정해요';
	}
	/** 보류가 안 풀린 줄이 있으면 빨간 띠 */
	get roundsBand(): string | null {
		const n = this.heldOpen.length;
		return n ? `10월분에 보류된 정산이 ${n}건 있어요 · 제조금액 원장에서 제조금액을 입력해 주세요` : null;
	}

	rounds(): RoundRow[] {
		const { tot, pays, paid, pct } = this.octTotals;
		const heldN = this.lines.filter((l) => l.hold).length;
		return [
			{
				month: '10',
				tileText: '10월',
				chips: [chip('확정', 'grey'), ...(heldN ? [chip(`보류 ${heldN}`, 'red')] : [])],
				meta: '11월 1일 오후 1:00 자동 계산',
				title: '10월분 정산',
				sub: `상품 ${this.lines.length}개 · 정산금 ${won(tot('settle'))} − 상계 ${won(tot('offset'))} + 보증금 환급 ${won(tot('dep'))}`,
				bar: { pct, text: `지급 ${paid.length}/${pays.length}건` },
				right: won(tot('pay')),
				rightSub: '지급 합계',
				href: '/settle/rounds/10'
			},
			{
				month: '9',
				tileText: '9월',
				chips: [chip('확정', 'grey')],
				meta: '10월 1일 오후 1:00 자동 계산',
				title: '9월분 정산',
				sub: `상품 ${SEPT.lines}개 · 정산금 ${won(SEPT.settle)} − 상계 ${won(SEPT.offset)} + 보증금 환급 ${won(SEPT.dep)}`,
				bar: { pct: 100, text: `지급 ${SEPT.paidN}/${SEPT.payN}건` },
				right: won(SEPT.pay),
				rightSub: '지급 합계',
				href: null
			}
		];
	}
	readonly onlyOct = '시안에는 10월분 상세만 담았어요';

	round(month: string): RoundDetail | null {
		if (month !== '10') return null;
		const { tot, pays, paid, paidSum, pct } = this.octTotals;
		const dash = (): TableCell => ({ t: '—', tone: 'dim' });
		const byCreator = new Map<string, SettleLine[]>();
		for (const l of this.lines) byCreator.set(l.creatorId, [...(byCreator.get(l.creatorId) ?? []), l]);
		const groups = [...byCreator.entries()].map(([creatorId, ls]) => {
			const c = creatorOf(creatorId);
			const pay = this.payouts.find((x) => x.creatorId === creatorId);
			const chips: Chip[] = [chip(`지급 ${won(pay?.amount ?? 0)}`, 'white'), ...(pay?.chips ?? [])];
			if (pay?.paid) chips.push(chip(`${pay.paid.at.split(' 오')[0]} ${pay.paid.manual ? '지급 완료 기록' : '자동 이체'}`, 'grey'));
			return {
				creatorId,
				name: c.name,
				handle: c.handle,
				chips,
				payoutHref: `/payouts/pay-${creatorId}`,
				table: {
					title: c.name,
					cols: ROUND_COLS,
					minW: 1034,
					head: [{ label: '상품' }, { label: '판매', right: true }, { label: '정산금', right: true }, { label: '정산 뒤 환불', right: true }, { label: '상계', right: true }, { label: '남은 제조금액', right: true }, { label: '보증금 환급', right: true }, { label: '지급액', right: true }],
					rows: ls.map((l): TableRow => {
						const p = productOf(l.productId);
						const status = l.hold ? (l.fixed ? `보류 · 제조금액 입력 완료 · ${NEXT_DAY} 정산에서 지급` : '보류 · 제조금액 확인 중') : l.dep ? '상환 완료 · 보증금 환급' : '';
						const sub = [l.month !== '10월분' ? l.month : '', status].filter(Boolean).join(' · ');
						return {
							subs: l.hold ? [] : [{ t: '주문 내역', v: `배송 완료 ${Math.round(l.sale / p.price)}건 · 판매 ${won(l.sale)}` }, ...(l.refund ? [{ t: '정산 뒤 환불', v: `9월분 환불 1건 · ${won(-l.refund)}` }] : []), { t: '정산금', v: `판매의 60% · ${won(l.settle)}` }],
							cells: [
								{ t: p.name, w: 'bold', sub: sub || undefined, subTone: l.hold ? 'red' : 'grey' },
								{ t: won(l.sale) },
								{ t: won(l.settle), w: 'bold' },
								l.refund ? { t: won(-l.refund), tone: 'red' } : dash(),
								l.hold || !l.offset ? dash() : { t: won(-l.offset), tone: 'orange' },
								l.hold || !l.before ? dash() : { t: `${won(l.before)} → ${won(l.after)}` },
								l.dep ? { t: `+${won(l.dep)}`, tone: 'mint' } : dash(),
								l.hold ? { t: '보류', tone: 'red', w: 'bold' } : { t: won(l.pay), w: 'black' }
							]
						};
					})
				}
			};
		});
		return {
			month,
			title: '10월분 정산',
			sub: '11월 1일 오후 1:00 자동 계산 · 확정',
			stats: [
				{ k: '정산금 합', v: won(tot('settle')) },
				{ k: '상계 합', v: won(tot('offset')), op: '−' },
				{ k: '보증금 환급 합', v: won(tot('dep')), op: '+' },
				{ k: '지급 합계', v: won(tot('pay')), tone: 'orange', op: '=', note: tot('refund') ? `(환불 차감 ${won(-tot('refund'))})` : undefined },
				{ k: '지급 진행', v: `${paid.length}/${pays.length}건` }
			],
			bar: { pct, text: `지급 완료 ${won(paidSum)} / ${won(tot('pay'))}` },
			groups
		};
	}

	// ───────── 동작(서버 RPC 자리) — 결과 문구를 돌려주고 화면은 토스트로 ─────────

	/** 원장 없는 상품에 첫 차수 — 보류된 10월분 줄이 있으면 보류 확정(다음 정산에서 지급) */
	createLedger(productId: string, amount: number, memo: string): Result {
		return this.addRound(productId, amount, memo);
	}
	addRound(productId: string, amount: number, memo: string): Result {
		if (!amount) return { ok: false, msg: '제조금액을 적어 주세요' };
		if (amount < 10000) return { ok: false, msg: '제조금액이 너무 작아요 — ₩10,000 이상으로 적어 주세요' };
		const l = this.ledgerOf(productId);
		const nth = l ? l.rounds.length + 1 : 1;
		const r: LedgerRound = { n: nth, amount, depositAt: fd(TODAY), refunded: false, memo: memo.trim(), by: me(), void: false };
		if (l) l.rounds.push(r);
		else this.ledgersRaw.push({ productId, rounds: [r], offset: 0 });
		const held = this.heldOpen.find((x) => x.productId === productId);
		for (const x of this.linesRaw) if (x.productId === productId && x.hold) x.fixed = true;
		return { ok: true, msg: held ? `보류를 확정했어요 · ${NEXT_DAY} 정산에서 지급돼요` : `${nth}차 제조금액 ${won(amount)}을 더했어요 · 보증금 ${won(amount * 0.25)} 보관 중` };
	}
	confirmDeposit(productId: string, isoDate: string): Result {
		if (!isoDate) return { ok: false, msg: '입금 확인일을 골라 주세요' };
		if (isoDate > TODAY) return { ok: false, msg: '입금 확인일은 오늘보다 뒤일 수 없어요' };
		const r = this.ledgerOf(productId)?.rounds.find((x) => !x.void && !x.depositAt);
		if (!r) return { ok: false, msg: '입금 확인을 기다리는 차수가 없어요' };
		r.depositAt = fd(isoDate);
		return { ok: true, msg: `${r.n}차 보증금 입금을 확인했어요` };
	}
	fixAmount(productId: string, amount: number, why: string): Result {
		const l = this.ledgerOf(productId);
		const r = l && [...l.rounds].reverse().find((x) => !x.void);
		if (!l || !r) return { ok: false, msg: '정정할 차수가 없어요' };
		if (!amount) return { ok: false, msg: '바른 제조금액을 적어 주세요' };
		if (!why.trim()) return { ok: false, msg: '사유를 적어 주세요' };
		const liveSum = l.rounds.filter((x) => !x.void).reduce((a, x) => a + x.amount, 0);
		if (liveSum - r.amount + amount < l.offset) return { ok: false, msg: `이미 상계한 금액보다 작게 정정할 수 없어요 — 상계한 금액 ${won(l.offset)}` };
		r.amount = amount;
		r.memo = `정정 · ${why.trim()}`;
		r.by = me();
		return { ok: true, msg: `${r.n}차 제조금액을 ${won(amount)}으로 정정했어요` };
	}
	voidRound(productId: string, why: string): Result {
		const l = this.ledgerOf(productId);
		const r = l && [...l.rounds].reverse().find((x) => !x.void);
		if (!l || !r) return { ok: false, msg: '무효로 할 차수가 없어요' };
		if (!why.trim()) return { ok: false, msg: '사유를 적어 주세요' };
		const liveSum = l.rounds.filter((x) => !x.void).reduce((a, x) => a + x.amount, 0);
		if (liveSum - r.amount < l.offset) return { ok: false, msg: `이미 상계한 금액이 있어 무효로 할 수 없어요 — 상계한 금액 ${won(l.offset)}` };
		r.void = true;
		r.memo = `무효 · ${why.trim()}`;
		r.by = me();
		return { ok: true, msg: `${r.n}차를 무효로 했어요` };
	}
	/** 회차 수동 실행 — 끝난 달만 · 11월분은 12월 1일 오후 1시부터 */
	runRound(): Result {
		return { ok: false, msg: '11월분은 아직 끝나지 않았어요 — 12월 1일 오후 1시부터 실행할 수 있어요' };
	}
}

export const settle = new SettleServer();
