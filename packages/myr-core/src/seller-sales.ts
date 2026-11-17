/**
 * 크리에이터 실적(순수) — 0076 `myr_app_seller_sales` 응답 모양 · 파서 · 화면 계산(CS 비율 · 7일 막대). DB·환경 없음 · src/test/seller-sales.test.ts.
 * 크리에이터 콘솔 홈(8번)이 쓰고, 운영 콘솔 실적도 같은 응답을 쓴다. 순매출 · 주문 · 수량 판정 자체는 RPC 하나에만 있다(백엔드 원칙 1). 정산 예상은 여기 없다 — 정산 탭 · 홈이 `myr_settlement_preview` 를 쓴다(옛 payout 은 0099 에서 없앴다).
 */

/** future = 아직 오지 않은 날(이번 주 오늘 뒤 · 서버 0117) */
export type SellerSalesDay = { date: string; orders: number; future: boolean };
export type SellerSales = {
	/** 'YYYY-MM' (KST) */
	month: string;
	gross: number;
	refunds: number;
	/** 이번 달 순매출 = gross − refunds */
	net: number;
	orders: number;
	units: number;
	refundedOrders: number;
	/** CS 비율(%) = 환불이 생긴 주문 ÷ 주문 · 소수 첫째 자리 · 주문이 없으면 null — 서버 값(0116 myr_cs_rate) */
	csRate: number | null;
	/** 이번 주 월 ~ 일(KST · 서버 0117 myr_kst_week) — 요일 순서가 늘 같다 */
	week: SellerSalesDay[];
	/** 이번 주 주문 수(서로 다른 주문 · 서버 week_orders) — 화면이 날짜별 값을 더하지 않는다 */
	weekOrders: number;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export function emptySellerSales(): SellerSales {
	return { month: '', gross: 0, refunds: 0, net: 0, orders: 0, units: 0, refundedOrders: 0, csRate: null, week: [], weekOrders: 0 };
}

/** RPC 응답 → 실적. 모양이 어긋나면 0 으로(홈이 깨지지 않게) */
export function parseSellerSales(v: unknown): SellerSales {
	const r = v as Record<string, unknown> | null;
	if (!r || typeof r !== 'object') return emptySellerSales();
	const week = Array.isArray(r.week)
		? (r.week as Record<string, unknown>[]).filter((d) => d && typeof d.date === 'string').map((d) => ({ date: d.date as string, orders: num(d.orders), future: d.future === true }))
		: [];
	return {
		month: typeof r.month === 'string' ? r.month : '',
		gross: num(r.gross),
		refunds: num(r.refunds),
		net: num(r.net),
		orders: num(r.orders),
		units: num(r.units),
		refundedOrders: num(r.refunded_orders),
		csRate: typeof r.cs_rate === 'number' && Number.isFinite(r.cs_rate) ? r.cs_rate : null,
		week,
		weekOrders: num(r.week_orders)
	};
}

/** CS 비율 글자 — 비율은 서버 값(0116 myr_cs_rate · 환불이 생긴 주문 ÷ 주문 · 2026-11-06 대표 결정 환불 기준) · 주문이 없으면(null) "—" */
export const csRateText = (s: Pick<SellerSales, 'csRate'>): string => (s.csRate === null ? '—' : `${s.csRate}%`);

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 'YYYY-MM-DD' → 요일(날짜 자체로 계산 · 시간대 무관) */
export function weekdayOf(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	if (!y || !m || !d) return '';
	return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 이번 주 막대 — 요일 · 값 · 높이(%) · 가장 많은 날 강조 · 아직 오지 않은 날(future · 막대 없이 흐리게). 전부 0 이면 높이 0 */
export function weekBars(week: SellerSalesDay[]): { day: string; date: string; value: number; height: number; top: boolean; future: boolean }[] {
	const max = Math.max(0, ...week.map((d) => d.orders));
	return week.map((d) => ({
		day: weekdayOf(d.date),
		date: d.date,
		value: d.orders,
		height: max ? Math.round((d.orders / max) * 100) : 0,
		top: max > 0 && d.orders === max,
		future: d.future
	}));
}
