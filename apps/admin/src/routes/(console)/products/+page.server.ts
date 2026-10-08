import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import {
	PRODUCT_ACTION_MESSAGES,
	PRODUCT_SPECIAL_FILTER_LABELS,
	PRODUCT_STATUSES,
	PRODUCT_STATUS_LABELS,
	parseProductSpecialFilter,
	parseProductStatusFilter
} from '@sellery/db/admin/product-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, checkFastReviewedProduct, listAdminProducts, rateLimit, reviewProduct } from '$lib/server/partners';

/**
 * `/products` — 전 브랜드 상품 검수 (데모 `(demo)/products` · 프로토타입 `vAdminProducts` 의 DB 판).
 * load: `requireAdmin` → `listAdminProducts({ status, brand, category, q })`.
 *   상태 칩(전체 · 검수 대기 · 노출 중 · 노출 중단 · 반려) + 브랜드 칩 + 카테고리 칩 + 검색.
 *   `?brand=b1` 로 들어오면 그 브랜드만 — 브랜드 목록·상세의 "상품 보기" 링크가 이 쿼리를 쓴다.
 * 액션 `?/review` — 0015 `app_admin_review_product`(approve · reject · pause). 반려는 사유 필수(≤200자).
 * 결과는 `?msg=` · 실패는 `?err=` 로 돌려주고 load 가 문구로 바꾼다.
 */
const RATE = 60;

function selfWithQuery(url: URL, params: Record<string, string> = {}): string {
	const p = new URLSearchParams();
	for (const k of ['status', 'special', 'brand', 'category', 'q'] as const) {
		const v = url.searchParams.get(k);
		if (v) p.set(k, v);
	}
	for (const [k, v] of Object.entries(params)) p.set(k, v);
	const qs = p.toString();
	return qs ? `${adminPath('/products')}?${qs}` : adminPath('/products');
}

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const status = parseProductStatusFilter(event.url.searchParams.get('status'));
	// 사후 점검 대기(0046) — 상태 칩과 배타적이다(둘을 겹치면 뜻이 모호해진다)
	const special = parseProductSpecialFilter(event.url.searchParams.get('special'));
	const brand = event.url.searchParams.get('brand');
	const category = event.url.searchParams.get('category');
	const q = (event.url.searchParams.get('q') ?? '').trim();
	const { rows, counts, brands, categories } = await listAdminProducts({ status: special ? null : status, special, brand, category, q: q || null });

	const self = adminPath('/products');
	const msgKey = event.url.searchParams.get('msg') ?? '';
	const errText = event.url.searchParams.get('err');
	const msg = errText
		? errText
		: msgKey === 'err_rate'
			? RATE_LIMIT_MESSAGE
			: msgKey
				? (PRODUCT_ACTION_MESSAGES[msgKey] ?? null)
				: null;

	const chipHref = (patch: Record<string, string | null>) => {
		const p = new URLSearchParams();
		const cur: Record<string, string | null> = { status, special, brand, category, q: q || null, ...patch };
		for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
		const qs = p.toString();
		return qs ? `${self}?${qs}` : self;
	};

	return {
		rows,
		counts,
		status,
		special,
		brand,
		category,
		q,
		msg,
		msgTone: errText || msgKey.startsWith('err') ? ('danger' as const) : ('ok' as const),
		self,
		brandsPath: adminPath('/brands'),
		statusChips: [
			{ key: '', label: '전체', count: counts.all, href: chipHref({ status: null, special: null }) },
			...PRODUCT_STATUSES.map((s) => ({ key: s, label: PRODUCT_STATUS_LABELS[s], count: counts[s] ?? 0, href: chipHref({ status: s, special: null }) }))
		],
		// 사후 점검 대기(0046) — 우선 검수권으로 검수를 건너뛴 상품. 0건이면 화면이 칩을 숨긴다
		specialChip: {
			key: 'fast_review',
			label: PRODUCT_SPECIAL_FILTER_LABELS.fast_review,
			count: counts.fast_review ?? 0,
			href: chipHref({ status: null, special: 'fast_review' })
		},
		brandChips: [
			{ key: '', label: '모든 브랜드', count: counts.all, href: chipHref({ brand: null }) },
			...brands.map((b) => ({ key: b.code ?? b.id, label: b.name, count: b.count, href: chipHref({ brand: b.code ?? b.id }) }))
		],
		categoryChips: [
			{ key: '', label: '모든 카테고리', count: counts.all, href: chipHref({ category: null }) },
			...categories.map((c) => ({ key: c.name, label: c.name, count: c.count, href: chipHref({ category: c.name }) }))
		]
	};
};

async function guard(event: RequestEvent, bucket: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	if (!rateLimit(`${bucket}:${gate.ctx.user.id}`, RATE)) redirect(303, selfWithQuery(event.url, { msg: 'err_rate' }));
	return gate;
}

export const actions: Actions = {
	review: async (event) => {
		await guard(event, 'admin-product-review');
		const form = await event.request.formData();
		const ref = String(form.get('product') ?? '').trim();
		const decisionRaw = String(form.get('decision') ?? '').trim();
		const reason = String(form.get('reason') ?? '').trim().slice(0, 200);
		if (!ref || !['approve', 'reject', 'pause'].includes(decisionRaw)) redirect(303, selfWithQuery(event.url, { msg: 'err_input' }));
		const decision = decisionRaw as 'approve' | 'reject' | 'pause';
		if (decision === 'reject' && !reason) redirect(303, selfWithQuery(event.url, { err: '반려 사유를 입력해주세요 (200자 이내).' }));

		const res = await reviewProduct(ref, decision, decision === 'reject' ? reason : null);
		redirect(303, res.ok ? selfWithQuery(event.url, { msg: res.code }) : selfWithQuery(event.url, { err: res.message }));
	},

	/**
	 * 사후 점검 완료 (0046) — 우선 검수권으로 검수를 건너뛴 상품을 "확인했다" 고 기록한다.
	 * 상품은 그대로 둔다(노출 유지). 문제가 있으면 `?/review` 의 reject·pause 를 쓴다 — 상태가
	 * 바뀌면 점검 대기 큐에서 자연히 빠진다.
	 */
	fastCheck: async (event) => {
		const gate = await guard(event, 'admin-product-fastcheck');
		const form = await event.request.formData();
		const ref = String(form.get('product') ?? '').trim();
		if (!ref) redirect(303, selfWithQuery(event.url, { msg: 'err_input' }));
		const res = await checkFastReviewedProduct(ref, gate.ctx.user.id);
		redirect(
			303,
			res.ok
				? selfWithQuery(event.url, { msg: res.already ? 'fast_check_already' : 'fast_check' })
				: selfWithQuery(event.url, { msg: `err_${res.code}` })
		);
	}
};
