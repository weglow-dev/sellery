/** 발송 처리(운송장) 순수 규칙 — 운영 API `/api/ops/ship` 의 본문 검증 · RPC 파서 · 문구 · 배송 조회 URL (테스트 src/test/ship-rules.test.ts · 0069).
 *  택배사 목록은 0069 RPC 와 같은 5곳(packages/db/src/carriers.ts 복사 · 한글명이 키). Svelte·DB import 없음. */
import { ORDER_CODE_RE } from './checkout-rules';

export const COURIERS = ['CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배'] as const;
export type Courier = (typeof COURIERS)[number];
export const isCourier = (v: unknown): v is Courier => typeof v === 'string' && (COURIERS as readonly string[]).includes(v);

/** 흔한 별칭 → 정식 이름(스크립트에서 'cj' 처럼 쳐도 되게). 모르면 입력 그대로(RPC 가 BAD_COURIER) */
const ALIASES: Record<string, Courier> = { cj: 'CJ대한통운', cj대한통운: 'CJ대한통운', 대한통운: 'CJ대한통운', 우체국: '우체국택배', 한진: '한진택배', 롯데: '롯데택배', 로젠: '로젠택배' };
export function normalizeCourier(raw: string): string {
	const t = raw.trim();
	return ALIASES[t.toLowerCase().replace(/\s+/g, '')] ?? t;
}
/** 운송장 — 숫자만 남긴다(하이픈·공백 제거). 길이 검사는 RPC(8~30)와 같은 식 */
export const normalizeTracking = (raw: string): string => raw.replace(/[\s-]/g, '');
export const TRACKING_RE = /^\d{8,30}$/;

const TRACK_URL: Record<Courier, (n: string) => string> = {
	CJ대한통운: (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`,
	우체국택배: (n) => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
	한진택배: (n) => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
	롯데택배: (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
	로젠택배: (n) => `https://www.ilogen.com/web/personal/trace/${n}`
};
export const trackingUrl = (courier: string, trackingNo: string): string | null => (isCourier(courier) ? TRACK_URL[courier](encodeURIComponent(trackingNo)) : null);

export type ShipInput = { orderCode: string; courier: string; trackingNo: string };
/** `{ orderCode, courier, trackingNo }` — 코드 소문자 · 택배사 별칭 정리 · 운송장 숫자만. 형식이 틀리면 field 와 문구 */
export function parseShipInput(raw: unknown): { ok: true; input: ShipInput } | { ok: false; field: 'orderCode' | 'courier' | 'trackingNo'; message: string } {
	const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
	const orderCode = typeof b?.orderCode === 'string' ? b.orderCode.trim().replace(/^#/, '').toLowerCase() : '';
	if (!ORDER_CODE_RE.test(orderCode)) return { ok: false, field: 'orderCode', message: '주문번호 형식이 올바르지 않아요 (예: MYR1001)' };
	const courier = normalizeCourier(typeof b?.courier === 'string' ? b.courier : '');
	if (!isCourier(courier)) return { ok: false, field: 'courier', message: `택배사는 ${COURIERS.join(' · ')} 중 하나예요` };
	const trackingNo = normalizeTracking(typeof b?.trackingNo === 'string' ? b.trackingNo : '');
	if (!TRACKING_RE.test(trackingNo)) return { ok: false, field: 'trackingNo', message: '운송장 번호는 숫자 8~30자리예요' };
	return { ok: true, input: { orderCode, courier, trackingNo } };
}

export type ShipResult =
	| { ok: true; already: boolean; orderId: string; orderCode: string; status: string; courier: string; trackingNo: string; shippedAt: string | null }
	| { ok: false; code: string; status?: string };
export function parseShipResult(json: unknown): ShipResult {
	const o = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
	if (!o) return { ok: false, code: 'BAD_RESULT' };
	const s = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
	if (o.ok === true) {
		if (!s('order_id') || !s('order_code')) return { ok: false, code: 'BAD_RESULT' };
		return { ok: true, already: o.already === true, orderId: s('order_id'), orderCode: s('order_code'), status: s('status'), courier: s('courier'), trackingNo: s('tracking_no'), shippedAt: s('shipped_at') || null };
	}
	return { ok: false, code: s('code') || 'BAD_RESULT', status: s('status') || undefined };
}

export const SHIP_MESSAGES: Record<string, string> = {
	NOT_FOUND: '주문을 찾을 수 없어요',
	WRONG_STATUS: '결제 완료(또는 부분 환불) 상태의 주문만 발송 처리할 수 있어요',
	BAD_COURIER: `택배사는 ${COURIERS.join(' · ')} 중 하나예요`,
	BAD_TRACKING: '운송장 번호는 숫자 8~30자리예요',
	NO_SERVICE_KEY: '발송 처리가 아직 설정되지 않았어요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};
export const shipMessage = (code: string): string => SHIP_MESSAGES[code] ?? SHIP_MESSAGES.DB_ERROR;

/** 발송 대기/완료 목록 행(0069 ship_pending · 0077 + shipStatus · preparing) */
export type ShipRow = { id: string; code: string; status: string; buyerName: string; recipient: string; orderName: string; amount: number; lines: number; paidAt: string | null; createdAt: string; courier: string | null; trackingNo: string | null; shippedAt: string | null; shipStatus: string | null; preparing: number };
export function parseShipRows(json: unknown): ShipRow[] {
	if (!Array.isArray(json)) return [];
	const out: ShipRow[] = [];
	for (const v of json) {
		const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
		if (!o || typeof o.id !== 'string' || typeof o.code !== 'string') continue;
		const s = (k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
		const n = (k: string): number => (typeof o[k] === 'number' ? (o[k] as number) : 0);
		out.push({ id: o.id, code: o.code, status: s('status') ?? '', buyerName: s('buyer_name') ?? '', recipient: s('recipient') ?? '', orderName: s('order_name') ?? '', amount: n('amount'), lines: n('lines'), paidAt: s('paid_at'), createdAt: s('created_at') ?? '', courier: s('courier'), trackingNo: s('tracking_no'), shippedAt: s('shipped_at'), shipStatus: s('ship_status'), preparing: n('preparing') });
	}
	return out;
}

/* ---------------- 배송 완료 수동 기록(0088) — 운영이 택배사 조회로 확인한 뒤 · 정산(0087)의 대상이 된다 ---------------- */

export type DeliverInput = { orderCode: string; deliveredAt: string | null };
/** `{ orderCode, date? }` — date = 실제 배송일 'YYYY-MM-DD'(한국 시간 · 그날 정오로 기록) · 없으면 지금 */
export function parseDeliverInput(raw: unknown): { ok: true; input: DeliverInput } | { ok: false; field: 'orderCode' | 'date'; message: string } {
	const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
	const orderCode = typeof b?.orderCode === 'string' ? b.orderCode.trim().replace(/^#/, '').toLowerCase() : '';
	if (!ORDER_CODE_RE.test(orderCode)) return { ok: false, field: 'orderCode', message: '주문번호 형식이 올바르지 않아요 (예: MYR1001)' };
	if (b?.date == null || b.date === '') return { ok: true, input: { orderCode, deliveredAt: null } };
	const m = typeof b.date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.date.trim()) : null;
	const t = m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T12:00:00+09:00`) : NaN;
	if (!m || Number.isNaN(t) || new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`)
		return { ok: false, field: 'date', message: '배송일은 YYYY-MM-DD 예요 (예: 2026-11-09)' };
	return { ok: true, input: { orderCode, deliveredAt: new Date(t).toISOString() } };
}

export const DELIVER_MESSAGES: Record<string, string> = {
	NOT_FOUND: '주문을 찾을 수 없어요',
	WRONG_STATUS: '결제 완료(또는 부분 환불) 상태의 주문만 배송 완료로 바꿀 수 있어요',
	NOT_SHIPPED: '배송중인 줄이 없어요 — 먼저 송장을 기록해 주세요',
	BAD_DATE: '배송일은 결제일 이후 · 오늘 이전이어야 해요',
	NO_SERVICE_KEY: '배송 완료 기록이 아직 설정되지 않았어요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};
export const deliverMessage = (code: string): string => DELIVER_MESSAGES[code] ?? DELIVER_MESSAGES.DB_ERROR;

/** 배송 완료가 없는 배송중 줄(myr_app_admin_undelivered) */
export type UndeliveredRow = {
	orderCode: string;
	itemId: string;
	product: string;
	option: string;
	qty: number;
	seller: string;
	courier: string | null;
	trackingNo: string | null;
	shippedAt: string | null;
	days: number;
	ebut: boolean;
	trackUrl: string | null;
};
export function parseUndelivered(json: unknown): UndeliveredRow[] {
	if (!Array.isArray(json)) return [];
	return json
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).order_code === 'string')
		.map((x) => {
			const s = (k: string): string => (typeof x[k] === 'string' ? (x[k] as string) : '');
			const courier = s('courier') || null;
			const trackingNo = s('tracking_no') || null;
			return {
				orderCode: s('order_code'),
				itemId: s('item_id'),
				product: s('product'),
				option: s('option'),
				qty: Number(x.qty) || 0,
				seller: s('seller'),
				courier,
				trackingNo,
				shippedAt: s('shipped_at') || null,
				days: Number(x.days) || 0,
				ebut: x.ebut === true,
				trackUrl: courier && trackingNo ? trackingUrl(courier, trackingNo) : null
			};
		});
}
