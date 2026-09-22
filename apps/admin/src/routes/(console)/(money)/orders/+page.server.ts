import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ADMIN_ORDER_FILTERS, ADMIN_ORDER_FILTER_LABEL, isAdminOrderFilter, type AdminOrderFilter } from '@sellery/db/admin/settle-rules';
import { orderShipState } from '@sellery/db/brand/order-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { listAdminOrders } from '$lib/server/money';

/**
 * `/orders` — 전체 주문 검색 (docs/admin-console-plan.md 결정 M10 "주문도 열람 + 환불만" · 프로토타입 vAdminOrders).
 * load: `listAdminOrders(?f=, ?q=, 200)`(0020 app_admin_orders — q 는 주문번호 · 구매자 · 캠페인 코드 · 상품 · 핸들 · 브랜드 · paymentKey). 행 → `/orders/[code]`(상세 · 환불).
 * 필터 칩 = ADMIN_ORDER_FILTERS(all · paid · unshipped · shipped · refunded · sample · manual(결제키 없음 — 시드·수기) · partial). totals 는 필터 무관.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const fRaw = event.url.searchParams.get('f') ?? 'all';
	const filter: AdminOrderFilter = isAdminOrderFilter(fRaw) ? fRaw : 'all';
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80) || null;
	const list = await listAdminOrders(filter, q, 200);

	const self = adminPath('/orders');
	const href = (f: AdminOrderFilter) => {
		const p = new URLSearchParams();
		if (f !== 'all') p.set('f', f);
		if (q) p.set('q', q);
		const s = p.toString();
		return s ? `${self}?${s}` : self;
	};
	const t = list?.totals;
	const countOf = (f: AdminOrderFilter): number | null => {
		if (!t) return null;
		if (f === 'all') return t.count;
		return t[f] ?? null;
	};

	return {
		email: gate.ctx.user.email ?? null,
		filter,
		q,
		loaded: list !== null,
		totals: t ?? null,
		rows: (list?.rows ?? []).map((o) => ({
			id: o.id,
			code: o.code,
			status: o.status,
			state: orderShipState(o),
			buyer_name: o.buyer_name,
			buyer_email: o.buyer_email,
			qty: o.qty,
			amount: o.amount,
			option_name: o.option_name,
			refund_amount: o.refund_amount,
			refund_actor: o.refund_actor,
			paid_at: o.paid_at,
			courier: o.courier,
			tracking_no: o.tracking_no,
			has_payment_key: o.has_payment_key,
			payment_method: o.payment_method,
			is_sample: o.is_sample,
			campaign: { code: o.campaign.code, status: o.campaign.status, product: o.campaign.product, seller: o.campaign.seller },
			brand: o.brand,
			href: adminPath(`/orders/${encodeURIComponent(o.code)}`)
		})),
		chips: ADMIN_ORDER_FILTERS.map((f) => ({ key: f, label: ADMIN_ORDER_FILTER_LABEL[f], n: countOf(f), href: href(f) })),
		self,
		clearHref: filter === 'all' ? self : `${self}?f=${filter}`,
		settlePath: adminPath('/settle'),
		csPath: adminPath('/cs')
	};
};
