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
};
export type SettleTotal = { sales: number; refundAdj: number; settle: number; offset: number; depositRefund: number; payout: number; held: number };
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
};
export type SellerSettlements = { settleStatus: string; preview: SettlePreview; ledgers: SettleLedger[]; months: SettleMonth[] };
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
		payout: nn(o.payout)
	};
}
function totalFrom(v: unknown): SettleTotal {
	const o = obj(v) ?? {};
	return { sales: n(o.sales), refundAdj: n(o.refund_adj), settle: n(o.settle), offset: n(o.offset), depositRefund: n(o.deposit_refund), payout: n(o.payout), held: n(o.held) };
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
				depositRefunded: n(x.deposit_refunded)
			})),
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
			refunded: x.kind === 'refund_adj' ? 0 : n(x.refund_snapshot)
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

/** 제조금액 갚은 비율(0~100) — 원장이 없거나 0원이면 100 */
export const repaidPct = (l: Pick<SettleLedger, 'total' | 'remaining'>): number => (l.total <= 0 ? 100 : Math.round(((l.total - l.remaining) / l.total) * 100));

/** 보증금 상태 한 줄 */
export function depositLabel(l: Pick<SettleLedger, 'depositPaid' | 'depositUnpaid' | 'depositRefunded' | 'remaining'>, won: (n: number) => string): string {
	const parts: string[] = [];
	const pending = l.depositPaid - l.depositRefunded;
	if (l.depositRefunded > 0) parts.push(`${won(l.depositRefunded)} 환급 완료`);
	if (pending > 0) parts.push(`${won(pending)} 제조금액을 다 갚으면 환급`);
	if (l.depositUnpaid > 0) parts.push(`${won(l.depositUnpaid)} 입금 확인 전`);
	return parts.join(' · ') || '없음';
}
