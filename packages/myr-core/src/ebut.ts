/**
 * 이벗(Ebut) 연동 — 순수(DB·네트워크 없음 · src/test/ebut.test.ts). docs/myr.md §6.8 E2 · E3.
 * 바인허브(`weglow-biz/vyneherb` backend/shop · Jobs/OrderStatusToPreparing · OrderStatusToDeliveringOrDelivered · Services/EbutOrderService)와 같은 규칙:
 *   - 평일 11시: 오늘 11시(KST) 전에 결제된 주문의 결제완료 줄 → `ordercreatem` → 응답 result 에서 success 'true' 인 줄만 배송준비중 · 주문 단위로 3회까지 재시도
 *   - 매일 18시: 배송준비중 · 배송중 줄 → `orderstatus`(codeType 2) → orderStatus '0'|'1' 이고 송장(invcExprNo) 있는 마지막 행 → 배송중 ·
 *     택배사 배송완료(exprStatus '91') 또는 (이미 배송중이고 발송 10일 지남) → 배송완료 · 끝난 뒤 남은 배송준비중 줄은 지연 표시
 *   - 줄 번호(orderNo · orderCodeNo) = 주문 줄 id · 교환 재발송(ordGbn 2)은 7번에서
 * 키가 하나라도 비면 꺼져 있다(`ebutReady`) — 크론은 아무것도 하지 않고 "꺼짐" 을 돌려준다.
 */

export const EBUT_BASE_URL = 'https://zuzfzmjszb.apigw.ntruss.com/OrderSheet/v2';

/** 이벗 설정 — 앱이 env(EBUT_*)에서 읽어 `configureMyrCore` 로 넣는다 */
export type EbutConfig = {
	id?: string;
	custCode?: string;
	apiKey?: string;
	/** 쇼핑몰 코드(ordShop) */
	ordShop?: string;
	senderName?: string;
	senderPhone?: string;
	senderZipcode?: string;
	senderAddress?: string;
	/** 이벗이 쓰는 택배사(화면 · 조회 링크용 · 선택) — '' 면 택배사 없이 송장만 */
	courier?: string;
};

const REQUIRED: (keyof EbutConfig)[] = ['id', 'custCode', 'apiKey', 'ordShop', 'senderName', 'senderPhone', 'senderZipcode', 'senderAddress'];
/** 필수 키가 다 있나 — 하나라도 비면 연동 꺼짐 */
export const ebutReady = (c: EbutConfig): boolean => REQUIRED.every((k) => typeof c[k] === 'string' && (c[k] as string).trim() !== '');
export const ebutMissing = (c: EbutConfig): string[] => REQUIRED.filter((k) => !(typeof c[k] === 'string' && (c[k] as string).trim() !== ''));

/* ---------------- 시각 ---------------- */

const KST = 9 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → 'YYYY-MM-DD HH:mm:ss'(KST) — ordDate · payDate */
export function kstDateTime(iso: string | null | undefined): string {
	const t = iso ? new Date(iso).getTime() : NaN;
	if (!Number.isFinite(t)) return '';
	const k = new Date(t + KST);
	return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`;
}
/** 오늘(KST) 11시 정각 — 발주 컷오프("11시 전 첫 결제") */
export function prepareCutoff(now: Date): Date {
	const k = new Date(now.getTime() + KST);
	return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), 11) - KST);
}

/* ---------------- 발주(ordercreatem) ---------------- */

/** 0077 `myr_app_admin_prepare_candidates` 의 한 줄 */
export type PrepareLine = {
	itemId: string;
	orderId: string;
	orderCode: string;
	orderedAt: string;
	paidAt: string | null;
	goodsCode: string;
	goodsName: string;
	goodsOption: string;
	qty: number;
	recipient: string;
	phone: string;
	postcode: string;
	address1: string;
	address2: string;
	memo: string;
};

const s = (v: unknown): string => (typeof v === 'string' ? v : '');
export function parsePrepareLines(v: unknown): PrepareLine[] {
	if (!Array.isArray(v)) return [];
	const out: PrepareLine[] = [];
	for (const r of v as Record<string, unknown>[]) {
		if (!r || typeof r.item_id !== 'string' || typeof r.order_id !== 'string') continue;
		const sh = (r.shipping && typeof r.shipping === 'object' ? r.shipping : {}) as Record<string, unknown>;
		out.push({
			itemId: r.item_id,
			orderId: r.order_id,
			orderCode: s(r.order_code),
			orderedAt: s(r.ordered_at),
			paidAt: typeof r.paid_at === 'string' ? r.paid_at : null,
			goodsCode: s(r.goods_code),
			goodsName: s(r.goods_name),
			goodsOption: s(r.goods_option),
			qty: typeof r.qty === 'number' ? r.qty : 0,
			recipient: s(sh.recipient),
			phone: s(sh.phone),
			postcode: s(sh.postcode),
			address1: s(sh.address1),
			address2: s(sh.address2),
			memo: s(sh.memo)
		});
	}
	return out;
}

/** 주문별로 묶기(입력 순서 유지) — 이벗 호출 · 재시도 단위 */
export function groupByOrder<T extends { orderId: string }>(lines: T[]): Map<string, T[]> {
	const m = new Map<string, T[]>();
	for (const l of lines) m.set(l.orderId, [...(m.get(l.orderId) ?? []), l]);
	return m;
}

/** ordercreatem 의 orderList 한 원소 — 바인허브 OrderStatusToPreparing 과 같은 키 · 같은 값 규칙 */
export type EbutOrderRow = Record<string, string | number>;
export function buildOrderList(lines: PrepareLine[], c: EbutConfig): EbutOrderRow[] {
	return lines.map((l) => ({
		id: c.id ?? '',
		custCode: c.custCode ?? '',
		ordShop: c.ordShop ?? '',
		ordGbn: '1',
		ordDate: kstDateTime(l.orderedAt),
		payDate: kstDateTime(l.paidAt),
		orderNo: l.itemId,
		receiverName: l.recipient,
		receiverPhone: l.phone,
		receiverCellPhone: l.phone,
		receiverZipcode: l.postcode,
		// 바인허브와 같게 주소를 이어 붙이고 공백을 지운다
		receiverAddress: `${l.address1}${l.address2}`.replace(/ /g, ''),
		receiverMemo: l.memo,
		goodsCode: l.goodsCode,
		goodsName: l.goodsName + (l.goodsOption ? ` - ${l.goodsOption}` : ''),
		goodsOpt: '',
		goodsQty: l.qty,
		orderDside: '1',
		senderName: c.senderName ?? '',
		senderPhone: c.senderPhone ?? '',
		senderCellPhone: c.senderPhone ?? '',
		senderZipcode: c.senderZipcode ?? '',
		senderAddress: c.senderAddress ?? ''
	}));
}

/** ordercreatem 응답 → 등록에 성공한 줄 id(result[].success === 'true' 의 orderNo) */
export function registeredItemIds(res: unknown): string[] {
	const r = (res && typeof res === 'object' ? (res as Record<string, unknown>).result : null) as unknown;
	if (!Array.isArray(r)) return [];
	return r
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && (x as Record<string, unknown>).success === 'true')
		.map((x) => String(x.orderNo ?? ''))
		.filter(Boolean);
}

/* ---------------- 송장 수집(orderstatus) ---------------- */

/** 0077 `myr_app_admin_ship_sync_candidates` 의 한 줄 */
export type SyncLine = { itemId: string; orderId: string; shipStatus: string; trackingNo: string | null; shippedAt: string | null };
export function parseSyncLines(v: unknown): SyncLine[] {
	if (!Array.isArray(v)) return [];
	return (v as Record<string, unknown>[])
		.filter((r) => r && typeof r.item_id === 'string' && typeof r.order_id === 'string')
		.map((r) => ({
			itemId: r.item_id as string,
			orderId: r.order_id as string,
			shipStatus: s(r.ship_status),
			trackingNo: typeof r.tracking_no === 'string' ? r.tracking_no : null,
			shippedAt: typeof r.shipped_at === 'string' ? r.shipped_at : null
		}));
}

export const DELIVERED_AFTER_DAYS = 10;
export type LineShipUpdate = { itemId: string; trackingNo: string; delivered: boolean };

/** orderstatus 의 data → 줄 갱신. 바인허브와 같다: orderCodeNo 로 묶고 orderStatus '0'(대기)|'1'(택배사 전달) · 송장 있는 행 중 마지막 →
 *  배송완료 = exprStatus '91' 또는 (지금 배송중이고 발송 10일 지남) */
export function lineUpdatesFromStatus(data: unknown, lines: SyncLine[], now: Date): LineShipUpdate[] {
	if (!Array.isArray(data)) return [];
	const last = new Map<string, Record<string, unknown>>();
	for (const row of data as Record<string, unknown>[]) {
		if (!row || typeof row !== 'object') continue;
		const no = String(row.orderCodeNo ?? '');
		const st = String(row.orderStatus ?? '');
		const inv = String(row.invcExprNo ?? '');
		if (!no || !['0', '1'].includes(st) || inv === '') continue;
		last.set(no, row);
	}
	const byId = new Map(lines.map((l) => [l.itemId, l]));
	const out: LineShipUpdate[] = [];
	for (const [no, row] of last) {
		const line = byId.get(no);
		if (!line) continue;
		const shippedAt = line.shippedAt ? new Date(line.shippedAt).getTime() : NaN;
		const old = line.shipStatus === 'SHIPPING' && Number.isFinite(shippedAt) && shippedAt <= now.getTime() - DELIVERED_AFTER_DAYS * 86_400_000;
		out.push({ itemId: no, trackingNo: String(row.invcExprNo).replace(/[\s-]/g, ''), delivered: String(row.exprStatus ?? '') === '91' || old });
	}
	return out;
}
