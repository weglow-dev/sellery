/**
 * 크리에이터 정산 탭(0089 · docs/myr.md §9-6 작업 순서 6) — 순수. DB 응답 → 화면 모양 · 라벨. 계산은 하지 않는다(DB 0087 · 0089 가 한 곳).
 * 테스트 src/test/seller-settlement.test.ts.
 */

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
};
/** netSales = 판매 − 정산 뒤 환불(서버 myr_settlement_net_sales) · payout = 지급 건 금액(서버 myr_payout_amount · 다음 정산은 예상 합) */
export type SettleTotal = { sales: number; refundAdj: number; netSales: number; settle: number; offset: number; depositRefund: number; payout: number; held: number };
export type SettlePreview = { month: string; settleAt: string | null; rows: SettleRow[]; total: SettleTotal; undelivered: { lines: number; amount: number } };
export type SettleMonth = { month: string; settledAt: string | null; rows: SettleRow[]; total: SettleTotal };
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
};
/** 제조금액 · 보증금 탭 머리 — 남은 제조금액 합 · 돌려받을 보증금 합(서버 0101) */
export type SettleLedgerTotal = { remaining: number; depositHeld: number };
export type SellerSettlements = { settleStatus: string; preview: SettlePreview; ledgers: SettleLedger[]; ledgerTotal: SettleLedgerTotal; months: SettleMonth[] };
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
	/** sale 줄: 정산 때 이미 빠진 환불(줄 금액 − amount) */
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
		nextPayout: o.next_payout === true
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

export function sellerSettlementsFromJson(v: unknown): SellerSettlements {
	const o = obj(v) ?? {};
	return {
		settleStatus: s(o.settle_status, 'none'),
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
				nextOffset: n(x.next_offset)
			})),
		ledgerTotal: { remaining: n(obj(o.ledger_total)?.remaining), depositHeld: n(obj(o.ledger_total)?.deposit_held) },
		months: arr(o.months)
			.map(obj)
			.filter((x): x is Obj => !!x && typeof x.month === 'string')
			.map((x) => ({ month: s(x.month), settledAt: typeof x.settled_at === 'string' ? x.settled_at : null, rows: rows(x.rows), total: totalFrom(x.total) }))
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
			refunded: x.kind === 'refund_adj' ? 0 : n(x.refund_snapshot),
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

/** 지급 보류 안내 — 사업자 · 정산 정보 확인 전이면(0085 verified 아님) 계산 · 확정은 되고 지급만 보류 */
export const payoutHold = (settleStatus: string): string | null => (settleStatus === 'verified' ? null : '사업자 · 정산 정보 확인 전이라 지급은 보류돼요');

/** 제조금액 갚은 비율(0~100 · 막대 너비) — 갚은 금액은 서버 offset(확정된 상계 합) · 원장이 없거나 0원이면 100 */
export const repaidPct = (l: Pick<SettleLedger, 'total' | 'offset'>): number => (l.total <= 0 ? 100 : Math.round((l.offset / l.total) * 100));

/** 보증금 상태 한 줄 */
export function depositLabel(l: Pick<SettleLedger, 'depositHeld' | 'depositUnpaid' | 'depositRefunded'>, won: (n: number) => string): string {
	const parts: string[] = [];
	if (l.depositRefunded > 0) parts.push(`${won(l.depositRefunded)} 환급 완료`);
	if (l.depositHeld > 0) parts.push(`${won(l.depositHeld)} 제조금액을 다 갚으면 환급`);
	if (l.depositUnpaid > 0) parts.push(`${won(l.depositUnpaid)} 입금 확인 전`);
	return parts.join(' · ') || '없음';
}

/* ---------------- 시안("MYR Influencer Admin" 정산 · 2026-11-10) 라벨 ---------------- */

const KST = 9 * 3600 * 1000;
const kst = (t: number) => new Date(t + KST);

/** 정산월 'YYYY-MM' → 정산(지급) 시각 = 다음 달 1일 13:00 KST (ISO) */
export function settleAtOfMonth(month: string): string | null {
	const m = /^(\d{4})-(\d{2})$/.exec(month);
	if (!m) return null;
	const y = Number(m[1]) + (Number(m[2]) === 12 ? 1 : 0);
	const mo = Number(m[2]) === 12 ? 1 : Number(m[2]) + 1;
	return new Date(Date.UTC(y, mo - 1, 1, 4, 0, 0)).toISOString();
}

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
/** 월 카드 · 상세 상태 — 다음 정산: 지급 예정 / 지급 보류(사업자 정보 확인 전) · 지난 정산: 지급 완료(2026-11-10 대표 — 시안대로 미리 · 실제 입금 기록은 작업 순서 7) / 일부 보류(제조금액 확인 중) */
export function monthStatus(o: { upcoming: boolean; held: number; settleStatus: string }): { label: string; tone: SettleTone } {
	if (o.upcoming) return o.settleStatus === 'verified' ? { label: '지급 예정', tone: 'plan' } : { label: '지급 보류', tone: 'hold' };
	if (o.held > 0) return { label: '일부 보류', tone: 'warn' };
	return { label: '지급 완료', tone: 'done' };
}

/** 정산 보류 배너(사업자 · 정산 정보) — 확인 완료면 null · 확인 중이면 버튼 없이 안내 */
export function holdBanner(settleStatus: string, nextDate: string): { title: string; body: string; cta: string | null } | null {
	if (settleStatus === 'verified') return null;
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
/** 다음 정산 상환 예정 · 보증금은 서버 값(nextOffset · depositHeld · depositTotal · 0101) — 여기서는 막대 너비 % 와 문구만 만든다 */
export function ledgerCard(l: SettleLedger, nextMonth: string, won: (n: number) => string) {
	const done = l.hasLedger && l.remaining === 0;
	const paidPct = repaidPct(l);
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
			l.depositRefunded > 0 && l.depositHeld === 0 && l.depositUnpaid === 0
				? `보증금 ${won(l.depositRefunded)} · 환급 완료`
				: l.depositUnpaid > 0
					? `보증금 ${won(l.depositTotal)} · 입금 확인 전 ${won(l.depositUnpaid)}`
					: `보증금 ${won(l.depositHeld)}`
	};
}
