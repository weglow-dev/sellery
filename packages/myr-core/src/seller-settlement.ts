/**
 * 크리에이터 정산 탭(0089 · docs/myr.md §9-6 작업 순서 6) — 순수. DB 응답 → 화면 모양 · 라벨. 계산은 하지 않는다(DB 0087 · 0089 가 한 곳).
 * 테스트 src/test/seller-settlement.test.ts.
 */

import { taxInvoiceFromJson, type TaxInvoice } from './tax-invoice';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nn = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type SettleProduct = { id: string; code: string; name: string; tile: string | null; icon: string; thumbUrl: string | null };
/** confirmed 확정 · held 보류(제조금액 확인 중) · estimated 예상(다음 정산) */
export type SettleRowStatus = 'confirmed' | 'held' | 'estimated';
export type SettleRow = {
	product: SettleProduct;
	status: SettleRowStatus;
	sales: number;
	refundAdj: number;
	carryIn: number;
	settle: number;
	/** 보류면 null(제조금액이 정해지면 계산) */
	offset: number | null;
	depositRefund: number | null;
	payout: number | null;
	/** 보류였다가 이 정산에서 해제되어 지급되는 지난 달('YYYY-MM') — 그 달 상품 줄이 따로 한 줄 더 생긴다 */
	origin: string | null;
	/** 이 줄이 다른 정산(지급 건)에서 지급된 달('YYYY-MM') — 이 달 합계에서는 빠져 있다(서버 0101 · 지급 건 기준) */
	releasedIn: string | null;
	/** 확정됐지만 아직 지급 건이 없다 — 다음 정산에서 지급(이 달 합계에서는 빠져 있다 · 0101) */
	nextPayout: boolean;
	/** 이 달(회차) 합계에 들어간 줄 — 서버 myr_settlement_card_rows(다음 정산 예상은 보류가 아니면 true) · 화면은 아닌 줄의 금액을 흐리게만 */
	counted: boolean;
	/** 보류 줄인데 다음 회차가 풀 줄(제조금액이 들어옴) — 서버 myr_settlement_row_releasable */
	releasable: boolean;
};
/** netSales = 판매 − 정산 뒤 환불(서버 myr_settlement_net_sales) · payout = 지급 건 금액(서버 myr_payout_amount · 다음 정산은 예상 합) */
export type SettleTotal = { sales: number; refundAdj: number; netSales: number; settle: number; offset: number; depositRefund: number; payout: number; held: number };
export type SettlePreview = { month: string; settleAt: string | null; rows: SettleRow[]; total: SettleTotal; undelivered: { lines: number; amount: number } };
/** 지급 보류 이유(서버 0102 · 0104 — code settle_info · tax_invoice · manual · label = myr_payout_hold_label) */
export type SettleHold = { code: string; label: string };
/** payAt = 지급 시각(서버 myr_settlement_pay_at — 다음 달 1일 오후 1시) · payoutStatus = 그 회차 지급 건 상태(pending · held · paid · none · 지급 건이 없으면 null)
 *  payoutLabel = 상태 문구(서버 myr_payout_status_label) · hold = 보류 이유 · paidOn = 이체한 날('YYYY-MM-DD' · 지급 완료일 때만 · 0103)
 *  invoice = 세금계산서(서버 myr_payout_invoice_json · 0104 — 지급 건이 없으면 null) */
export type SettleMonth = {
	month: string;
	settledAt: string | null;
	payAt: string | null;
	payoutStatus: string | null;
	payoutLabel: string;
	hold: SettleHold | null;
	paidOn: string | null;
	invoice: TaxInvoice | null;
	rows: SettleRow[];
	total: SettleTotal;
};
/** 보증금 상태(서버 myr_mfg_deposits.state) — 환급 완료 · 입금 확인 전 · 맡김 */
export type DepositState = 'refunded' | 'unpaid' | 'held';
export type SettleLedger = {
	product: SettleProduct;
	hasLedger: boolean;
	batches: { seq: number; amount: number; depositAmount: number; depositPaid: boolean; depositRefunded: boolean }[];
	total: number;
	offset: number;
	remaining: number;
	depositPaid: number;
	depositUnpaid: number;
	depositRefunded: number;
	/** 돌려받을 보증금(입금 확인 · 환급 전) · 보증금 전체(환급 전 · 입금 확인 전 포함) · 다음 정산 상환 예정 — 서버 값(0101 · 화면이 빼고 더하지 않는다) */
	depositHeld: number;
	depositTotal: number;
	nextOffset: number;
	/** 상환 완료(원장이 있고 남은 제조금액 0 — 서버 myr_mfg_paid_off) */
	paidOff: boolean;
	/** 제조금액 갚은 비율(0~100 · 서버 myr_mfg_repaid_pct · 0103) */
	repaidPct: number;
	depositState: DepositState;
};
/** 제조금액 · 보증금 탭 머리 — 남은 제조금액 합 · 돌려받을 보증금 합(서버 0101) */
export type SettleLedgerTotal = { remaining: number; depositHeld: number };
/** nextHold = 다음 정산 보류 이유(크리에이터 쪽 · 서버 myr_seller_hold_reason) — 없으면 null */
export type SellerSettlements = { settleStatus: string; nextHold: SettleHold | null; preview: SettlePreview; ledgers: SettleLedger[]; ledgerTotal: SettleLedgerTotal; months: SettleMonth[] };
export type SettleItem = {
	orderCode: string;
	buyer: string;
	deliveredAt: string | null;
	productCode: string;
	product: string;
	option: string;
	qty: number;
	unitPrice: number;
	groupbuy: boolean;
	kind: 'sale' | 'refund_adj';
	amount: number;
	/** 정산 때 줄 환불 누적(서버 refund_snapshot) — 화면은 sale 줄에서만 "환불 −" 로 보여 준다(kind 로 문구를 고른다) */
	refunded: number;
	/** 보류 해제분 줄이면 원래 달('YYYY-MM') */
	origin: string | null;
};

function productFrom(v: unknown): SettleProduct {
	const o = obj(v) ?? {};
	return { id: s(o.id), code: s(o.code), name: s(o.name), tile: typeof o.tile === 'string' ? o.tile : null, icon: s(o.icon, 'pill'), thumbUrl: typeof o.thumb_url === 'string' ? o.thumb_url : null };
}
function rowFrom(v: unknown): SettleRow | null {
	const o = obj(v);
	if (!o) return null;
	const status: SettleRowStatus = o.status === 'confirmed' || o.status === 'held' ? o.status : 'estimated';
	return {
		product: productFrom(o.product),
		status,
		sales: n(o.sales),
		refundAdj: n(o.refund_adj),
		carryIn: n(o.carry_in),
		settle: n(o.settle),
		offset: nn(o.offset),
		depositRefund: nn(o.deposit_refund),
		payout: nn(o.payout),
		origin: typeof o.origin === 'string' ? o.origin : null,
		releasedIn: typeof o.released_in === 'string' ? o.released_in : null,
		nextPayout: o.next_payout === true,
		counted: o.counted === true,
		releasable: o.releasable === true
	};
}
function totalFrom(v: unknown): SettleTotal {
	const o = obj(v) ?? {};
	return { sales: n(o.sales), refundAdj: n(o.refund_adj), netSales: n(o.net_sales), settle: n(o.settle), offset: n(o.offset), depositRefund: n(o.deposit_refund), payout: n(o.payout), held: n(o.held) };
}
const rows = (v: unknown): SettleRow[] => arr(v).map(rowFrom).filter((r): r is SettleRow => !!r);

export function settlePreviewFromJson(v: unknown): SettlePreview {
	const o = obj(v) ?? {};
	const u = obj(o.undelivered) ?? {};
	return { month: s(o.month), settleAt: typeof o.settle_at === 'string' ? o.settle_at : null, rows: rows(o.rows), total: totalFrom(o.total), undelivered: { lines: n(u.lines), amount: n(u.amount) } };
}

function holdFrom(v: unknown): SettleHold | null {
	const o = obj(v);
	return o && typeof o.code === 'string' ? { code: o.code, label: s(o.label) } : null;
}

export function sellerSettlementsFromJson(v: unknown): SellerSettlements {
	const o = obj(v) ?? {};
	return {
		settleStatus: s(o.settle_status, 'none'),
		nextHold: holdFrom(o.next_hold),
		preview: settlePreviewFromJson(o.preview),
		ledgers: arr(o.ledgers)
			.map(obj)
			.filter((x): x is Obj => !!x)
			.map((x) => ({
				product: productFrom(x.product),
				hasLedger: x.has_ledger === true,
				batches: arr(x.batches)
					.map(obj)
					.filter((b): b is Obj => !!b)
					.map((b) => ({ seq: n(b.seq), amount: n(b.amount), depositAmount: n(b.deposit_amount), depositPaid: b.deposit_paid === true, depositRefunded: b.deposit_refunded === true })),
				total: n(x.total),
				offset: n(x.offset),
				remaining: n(x.remaining),
				depositPaid: n(x.deposit_paid),
				depositUnpaid: n(x.deposit_unpaid),
				depositRefunded: n(x.deposit_refunded),
				depositHeld: n(x.deposit_held),
				depositTotal: n(x.deposit_total),
				nextOffset: n(x.next_offset),
				paidOff: x.paid_off === true,
				repaidPct: n(x.repaid_pct),
				depositState: (x.deposit_state === 'refunded' || x.deposit_state === 'unpaid' ? x.deposit_state : 'held') as DepositState
			})),
		ledgerTotal: { remaining: n(obj(o.ledger_total)?.remaining), depositHeld: n(obj(o.ledger_total)?.deposit_held) },
		months: arr(o.months)
			.map(obj)
			.filter((x): x is Obj => !!x && typeof x.month === 'string')
						.map((x) => ({
				month: s(x.month),
				settledAt: typeof x.settled_at === 'string' ? x.settled_at : null,
				payAt: typeof x.pay_at === 'string' ? x.pay_at : null,
				payoutStatus: typeof x.payout_status === 'string' ? x.payout_status : null,
				payoutLabel: s(x.payout_label),
				hold: holdFrom(x.hold),
				paidOn: typeof x.paid_on === 'string' ? x.paid_on : null,
				invoice: taxInvoiceFromJson(x.invoice),
				rows: rows(x.rows),
				total: totalFrom(x.total)
			}))
	};
}

export function settleItemsFromJson(v: unknown): SettleItem[] {
	return arr(v)
		.map(obj)
		.filter((x): x is Obj => !!x && typeof x.order_code === 'string')
		.map((x) => ({
			orderCode: s(x.order_code),
			buyer: s(x.buyer, '고객'),
			deliveredAt: typeof x.delivered_at === 'string' ? x.delivered_at : null,
			productCode: s(x.product_code),
			product: s(x.product),
			option: s(x.option),
			qty: n(x.qty),
			unitPrice: n(x.unit_price),
			groupbuy: x.groupbuy === true,
			kind: x.kind === 'refund_adj' ? 'refund_adj' : 'sale',
			amount: n(x.amount),
			refunded: n(x.refund_snapshot),
			origin: typeof x.origin === 'string' ? x.origin : null
		}));
}

export const emptySellerSettlements = (): SellerSettlements => sellerSettlementsFromJson(null);

/* ---------------- 라벨 ---------------- */

/** 상품 줄 요약 — '판매 ₩64,000 · 정산 뒤 환불 −₩32,000 · 정산금 ₩38,400 · 상계 −₩30,000 · 보증금 +₩7,500' (0 인 칸은 뺀다) */
export function settleRowText(r: Pick<SettleRow, 'sales' | 'refundAdj' | 'carryIn' | 'settle' | 'offset' | 'depositRefund'>, won: (n: number) => string): string {
	return [
		`판매 ${won(r.sales)}`,
		r.refundAdj ? `정산 뒤 환불 −${won(r.refundAdj)}` : '',
		r.carryIn ? `지난 이월 −${won(-r.carryIn)}` : '',
		`정산금 ${won(r.settle)}`,
		r.offset ? `상계 −${won(r.offset)}` : '',
		r.depositRefund ? `보증금 +${won(r.depositRefund)}` : ''
	]
		.filter(Boolean)
		.join(' · ');
}

export const SETTLE_ROW_META: Record<SettleRowStatus, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
	confirmed: { label: '확정', tone: 'ok' },
	held: { label: '보류 · 제조금액 확인 중', tone: 'warn' },
	estimated: { label: '예상', tone: 'muted' }
};

/** '2026-10' → '10월' (올해가 아니면 '2025년 12월') */
export function monthLabel(month: string, now: Date | number = Date.now()): string {
	const m = /^(\d{4})-(\d{2})$/.exec(month);
	if (!m) return month;
	const year = new Date((typeof now === 'number' ? now : now.getTime()) + 9 * 3600 * 1000).getUTCFullYear();
	return `${Number(m[1]) === year ? '' : `${m[1]}년 `}${Number(m[2])}월`;
}

/** 정산일 표시 — '12월 1일(월) 오후 1시' */
export function settleAtLabel(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
	const h = d.getUTCHours();
	return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${'일월화수목금토'[d.getUTCDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;
}

/* ---------------- 시안("MYR Influencer Admin" 정산 · 2026-11-10) 라벨 ---------------- */

const KST = 9 * 3600 * 1000;
const kst = (t: number) => new Date(t + KST);

/** 'D-21' · 'D-DAY' (한국 날짜 기준) · 지났으면 '' */
export function dDay(settleAt: string | null, now: number = Date.now()): string {
	if (!settleAt) return '';
	const day = (t: number) => Math.floor(kst(t).getTime() / 86400000);
	const d = day(Date.parse(settleAt)) - day(now);
	return d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : '';
}

/** '12월 1일' */
export const shortDate = (iso: string | null): string => (iso ? `${kst(Date.parse(iso)).getUTCMonth() + 1}월 ${kst(Date.parse(iso)).getUTCDate()}일` : '');

/** '11월' (정산월 짧게) */
export const monthShort = (month: string): string => {
	const m = /^\d{4}-(\d{2})$/.exec(month);
	return m ? `${Number(m[1])}월` : month;
};

export type SettleTone = 'plan' | 'hold' | 'warn' | 'done';
/** 월 카드 상태 칩 — 다음 정산은 보류 이유(서버 nextHold)가 있으면 지급 보류 · 지난 회차는 지급 건 상태(서버 payoutStatus · 문구 payoutLabel). 여기서는 색만 고른다 */
const PAYOUT_TONE: Record<string, SettleTone> = { pending: 'plan', held: 'hold', paid: 'done', none: 'done' };
export function monthStatus(o: { upcoming: true; nextHold: SettleHold | null } | { upcoming: false; payoutStatus: string | null; payoutLabel: string }): { label: string; tone: SettleTone } {
	if (o.upcoming) return o.nextHold ? { label: '지급 보류', tone: 'hold' } : { label: '지급 예정', tone: 'plan' };
	return { label: o.payoutLabel, tone: PAYOUT_TONE[o.payoutStatus ?? 'none'] ?? 'done' };
}

/** 정산 보류 배너(사업자 · 정산 정보) — 보일지는 서버 보류 이유(nextHold.code === 'settle_info')가 정한다. 여기서는 입력 상태별 문구 · 버튼만 고른다 */
export function holdBanner(settleStatus: string, nextDate: string): { title: string; body: string; cta: string | null } {
	if (settleStatus === 'pending') return { title: '정산 정보를 확인하고 있어요', body: `운영팀 확인이 끝나면 ${nextDate} 정산부터 지급돼요.`, cta: null };
	if (settleStatus === 'rejected') return { title: '정산이 보류 중이에요', body: '정산 정보를 다시 입력해 주세요. 확인되면 바로 지급돼요.', cta: '정산 정보 다시 입력하기' };
	return { title: '정산이 보류 중이에요', body: `사업자 · 정산 계좌 정보를 등록하면 ${nextDate} 정산부터 바로 지급돼요.`, cta: '정산 정보 등록하기' };
}

/** 상품 줄 열쇠 — 같은 상품이라도 보류 해제분(origin)은 다른 줄 */
export const rowKey = (productCode: string, origin: string | null): string => `${productCode}|${origin ?? ''}`;

/** 주문 줄 → 상품 줄(rowKey)별 묶음 */
export function itemsByProduct(items: SettleItem[]): Map<string, SettleItem[]> {
	const m = new Map<string, SettleItem[]>();
	for (const it of items) {
		const k = rowKey(it.productCode, it.origin);
		m.set(k, [...(m.get(k) ?? []), it]);
	}
	return m;
}

/** 제조 원장 카드(시안 "제조금액 · 보증금") — 칩 · 막대(갚은 % · 다음 정산 상환 예정 %) · 보증금 문구 */
/** 상환 완료 · 다음 정산 상환 예정 · 보증금 금액과 상태는 서버 값(paidOff · nextOffset · depositHeld · depositTotal · depositState · 0101) — 여기서는 막대 너비 % 와 문구만 만든다 */
export function ledgerCard(l: SettleLedger, nextMonth: string, won: (n: number) => string) {
	const done = l.paidOff;
	// 갚은 비율은 서버 값(repaid_pct) · 다음 정산 상환 예정 막대 너비(planPct)만 여기서 — 글자로 보이지 않는 그림 크기
	const paidPct = l.repaidPct;
	const nextOffset = l.nextOffset || null;
	const planPct = !done && l.total > 0 && nextOffset ? Math.min(100 - paidPct, (nextOffset / l.total) * 100) : 0;
	return {
		chip: !l.hasLedger ? '제조금액 확인 중' : done ? '상환 완료' : '상환 중',
		// 시안: 상환 중 = 주황 · 상환 완료 = 회색 · 제조금액 확인 중 = 빨강
		tone: (!l.hasLedger ? 'hold' : done ? 'done' : 'warn') as SettleTone,
		paidPct,
		planPct,
		planText: !done && nextOffset ? `${monthShort(nextMonth)} 정산에서 ${won(nextOffset)} 상환 예정` : '',
		depositText:
			l.depositState === 'refunded'
				? `보증금 ${won(l.depositRefunded)} · 환급 완료`
				: l.depositState === 'unpaid'
					? `보증금 ${won(l.depositTotal)} · 입금 확인 전 ${won(l.depositUnpaid)}`
					: `보증금 ${won(l.depositHeld)}`
	};
}
