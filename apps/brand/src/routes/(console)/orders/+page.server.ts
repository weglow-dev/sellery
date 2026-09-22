import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	BRAND_REFUND_DEFAULT_REASON,
	BRAND_REFUND_REASON_MAX,
	ORDER_FILTERS,
	SHIP_ORDER_DONE_MESSAGES,
	brandRefundFailMessage,
	bulkShipSummary,
	isOrderFilter,
	orderRowLabel,
	orderShipState,
	parseBulkShipCsv,
	parseShipOrderInput,
	shipOrderFailMessage,
	type BulkShipRowResult,
	type OrderFilter
} from '@sellery/db/brand/order-rules';
import { trackingUrlOf } from '@sellery/db/carriers';
import { REFUND_REASONS } from '@sellery/db/order-status';
import { RATE_LIMIT_MESSAGE, brandPath, listBrandCampaigns, listBrandOrders, rateLimit, requireBrand, shipOrder, shipOrdersBulk } from '$lib/server/brand';
import { refundOrderAsBrand } from '$lib/server/payments';

/**
 * `/orders` — 주문 · 발주 · 운송장 4단계 (docs/brand-console-plan.md §5 `/brand/orders` · §6 행 4 PR-B · 프로토타입 데모 demo-orders/+page.svelte + actions.ts saveTrackOne / applyTrackCSV / trackCSVTemplate / poCSV / refund).
 * 읽기: `listBrandOrders(brand.id, ?f=, ?campaign=)` — 샘플 제외 · 미발송 우선 · totals 는 필터 무관 · 수취인 원문(발송 목적 · §8) + 캠페인 셀렉트용 `listBrandCampaigns`.
 * 액션(행에서 바로): `?/ship`(택배사 + 송장 → `shipOrder` · 정정은 덮어쓰기) → 303 `?msg=saved|replaced|already&code=` · 폼 검증 실패는 fail(400) 로 그 행에 값 유지
 *   · `?/shipBulk`(textarea 또는 CSV 파일 `주문번호,택배사,운송장번호` → `parseBulkShipCsv` → `shipOrdersBulk`) → 행별 결과를 ActionData 로 같은 페이지에
 *   · `?/refund`(사유 셀렉트 + 메모 → `refundOrderAsBrand` — 발송 전 PAID 만 · 시드·수기 주문은 NO_PAYMENT_KEY) → 303 `?msg=refunded|already&code=` · 실패 `?err=`.
 * 파일: [발주서 CSV] `GET /orders/po.csv?campaign=` · [양식 다운로드] `GET /orders/ship-template.csv` (형제 +server.ts).
 */
export type OrdersMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const REFUND_REASON_OPTIONS: readonly string[] = [...REFUND_REASONS, '재고 부족', '브랜드 사정'];

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/orders' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const fRaw = event.url.searchParams.get('f') ?? 'all';
	const filter: OrderFilter = isOrderFilter(fRaw) ? fRaw : 'all';
	const campaign = (event.url.searchParams.get('campaign') ?? '').trim() || null;

	const [list, campaigns] = await Promise.all([listBrandOrders(brand.id, filter, campaign), listBrandCampaigns(brand.id)]);

	const key = event.url.searchParams.get('msg') ?? '';
	const doneCode = (event.url.searchParams.get('code') ?? '').toUpperCase();
	const err = event.url.searchParams.get('err');
	let msg: OrdersMessage | null = null;
	if (err) msg = { tone: 'danger', text: doneCode ? `${doneCode} — ${err}` : err };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key === 'saved') msg = { tone: 'ok', text: `${doneCode} ${SHIP_ORDER_DONE_MESSAGES.saved}` };
	else if (key === 'replaced') msg = { tone: 'ok', text: `${doneCode} ${SHIP_ORDER_DONE_MESSAGES.replaced}` };
	else if (key === 'already') msg = { tone: 'info', text: `${doneCode} ${SHIP_ORDER_DONE_MESSAGES.already}` };
	else if (key === 'refunded') msg = { tone: 'ok', text: `${doneCode} 환불 처리 — 고객에게 결제 취소가 안내됩니다` };
	else if (key === 'refund_already') msg = { tone: 'info', text: `${doneCode} 이미 환불된 주문이에요` };

	const q = (f: OrderFilter, c: string | null) => {
		const p = new URLSearchParams();
		if (f !== 'all') p.set('f', f);
		if (c) p.set('campaign', c);
		const s = p.toString();
		return s ? `?${s}` : '';
	};
	const self = brandPath('/orders');
	const orderCampaigns = campaigns.filter((c) => ['LIVE', 'CLEARING', 'SETTLED', 'SCHEDULE_CONFIRMED'].includes(c.status));
	const selectedCampaign = campaign ? orderCampaigns.find((c) => c.code.toLowerCase() === campaign.toLowerCase()) ?? null : null;

	return {
		msg,
		filter,
		campaign,
		selectedCampaign: selectedCampaign ? { code: selectedCampaign.code, product_name: selectedCampaign.product.name, seller_handle: selectedCampaign.seller.handle } : null,
		chips: ORDER_FILTERS.map((f) => ({
			key: f.key,
			label: f.label,
			n: f.key === 'all' ? list.totals.count : list.totals[f.key],
			href: `${self}${q(f.key, campaign)}`
		})),
		campaignOptions: orderCampaigns.map((c) => ({ code: c.code, label: `${c.code.toUpperCase()} · ${c.product.name} · ${c.seller.handle}`, status: c.status, href: `${self}${q(filter, c.code)}` })),
		allHref: `${self}${q(filter, null)}`,
		totals: list.totals,
		rows: list.rows.map((o) => {
			const state = orderShipState(o);
			return {
				code: o.code,
				status: o.status,
				state,
				chip: orderRowLabel(o),
				buyer_name: o.buyer_name,
				buyer_phone: o.buyer_phone,
				qty: o.qty,
				amount: o.amount,
				option_name: o.option_name,
				shipping: o.shipping,
				courier: o.courier,
				tracking_no: o.tracking_no,
				shipped_at: o.shipped_at,
				trackingUrl: trackingUrlOf(o.courier, o.tracking_no),
				paid_at: o.paid_at,
				payment_method: o.payment_method,
				refunded_at: o.refunded_at,
				refund_amount: o.refund_amount,
				refund_actor: o.refund_actor,
				refund_reason: o.refund_reason,
				// 브랜드 환불 가드(0018 precheck)와 같은 조건을 화면에서 미리 — 실제 판정은 `?/refund` 가 다시 한다
				refundable: state === 'unshipped' && o.campaign.status !== 'SETTLED',
				campaign: { code: o.campaign.code, status: o.campaign.status, href: brandPath(`/campaigns/${encodeURIComponent(o.campaign.code)}`), product: o.campaign.product, seller: o.campaign.seller }
			};
		}),
		refundReasons: REFUND_REASON_OPTIONS,
		refundReasonMax: BRAND_REFUND_REASON_MAX,
		poHref: `${brandPath('/orders/po.csv')}${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ''}`,
		templateHref: brandPath('/orders/ship-template.csv'),
		csPath: brandPath('/cs'),
		campaignsPath: brandPath('/campaigns')
	};
};

const self = brandPath('/orders');

/** 현재 필터 · 캠페인을 리다이렉트에 유지 */
function back(event: RequestEvent, params: Record<string, string>): string {
	const p = new URLSearchParams();
	const f = event.url.searchParams.get('f');
	const c = event.url.searchParams.get('campaign');
	if (f && f !== 'all') p.set('f', f);
	if (c) p.set('campaign', c);
	for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
	const s = p.toString();
	return s ? `${self}?${s}` : self;
}

const formValues = (fd: FormData): Record<string, string> => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;

export const actions: Actions = {
	ship: async (event) => {
		const r = await requireBrand(event, { next: '/orders' });
		if (!r.ok) redirect(303, r.location);
		if (!rateLimit(`orders-ship:${r.ctx.user.id}`, 200)) redirect(303, back(event, { msg: 'err_rate' }));
		const fd = await event.request.formData();
		const values = formValues(fd);
		const parsed = parseShipOrderInput(fd);
		if (!parsed.ok) return fail(400, { kind: 'ship' as const, code: values.order_code ?? '', field: parsed.field, message: parsed.message, values });
		const res = await shipOrder(r.ctx.brand.id, parsed.orderCode, parsed.courier, parsed.trackingNo);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '주문을 찾을 수 없습니다' });
			redirect(303, back(event, { err: shipOrderFailMessage(res), code: parsed.orderCode }));
		}
		redirect(303, back(event, { msg: res.already ? 'already' : res.replaced ? 'replaced' : 'saved', code: res.orderCode }));
	},

	shipBulk: async (event) => {
		const r = await requireBrand(event, { next: '/orders' });
		if (!r.ok) redirect(303, r.location);
		if (!rateLimit(`orders-bulk:${r.ctx.user.id}`)) return fail(429, { kind: 'bulk' as const, message: RATE_LIMIT_MESSAGE, values: {} as Record<string, string> });
		const fd = await event.request.formData();
		const file = fd.get('file');
		let text = typeof fd.get('csv') === 'string' ? (fd.get('csv') as string) : '';
		if (file instanceof File && file.size > 0) {
			if (file.size > 1_000_000) return fail(400, { kind: 'bulk' as const, message: '파일은 1MB 까지 올릴 수 있어요', values: { csv: text } });
			text = await file.text();
		}
		const values = { csv: text };
		if (!text.trim()) return fail(400, { kind: 'bulk' as const, message: '주문번호,택배사,운송장번호 행을 붙여넣거나 CSV 파일을 올려주세요', values });
		const parsed = parseBulkShipCsv(text);
		if (!parsed.rows.length) {
			return fail(400, { kind: 'bulk' as const, message: '적용할 수 있는 행이 없어요 — 형식을 확인해주세요', values, csvErrors: parsed.errors });
		}
		const res = await shipOrdersBulk(r.ctx.brand.id, parsed.rows);
		if (!res.ok) return fail(400, { kind: 'bulk' as const, message: res.code === 'BAD_ROWS' ? '적용할 수 있는 행이 없어요' : '잠시 후 다시 시도해주세요', values, csvErrors: parsed.errors });
		const results = res.results.map((x: BulkShipRowResult) => ({
			order_code: x.order_code.toUpperCase(),
			ok: x.ok,
			text: x.ok ? (x.already ? `이미 등록 · ${x.courier} ${x.tracking_no}` : `${x.courier} ${x.tracking_no}`) : shipOrderFailMessage(x)
		}));
		return { kind: 'bulk' as const, summary: bulkShipSummary(res, parsed.errors.length), applied: res.applied, results, csvErrors: parsed.errors };
	},

	refund: async (event) => {
		const r = await requireBrand(event, { next: '/orders' });
		if (!r.ok) redirect(303, r.location);
		if (!rateLimit(`orders-refund:${r.ctx.user.id}`)) redirect(303, back(event, { msg: 'err_rate' }));
		const fd = await event.request.formData();
		const values = formValues(fd);
		const code = (values.order_code ?? '').trim();
		if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });
		const reasonPick = (values.reason ?? '').trim();
		const memo = (values.reason_text ?? '').trim();
		const reason = [REFUND_REASON_OPTIONS.includes(reasonPick) ? reasonPick : '', memo].filter(Boolean).join(' — ').slice(0, BRAND_REFUND_REASON_MAX) || BRAND_REFUND_DEFAULT_REASON;
		const res = await refundOrderAsBrand(r.ctx.brand.id, code, reason);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '주문을 찾을 수 없습니다' });
			redirect(303, back(event, { err: brandRefundFailMessage(res.code), code }));
		}
		redirect(303, back(event, { msg: res.already ? 'refund_already' : 'refunded', code: res.orderCode }));
	}
};
