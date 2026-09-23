import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { BRAND_ACTION_MESSAGES, BRAND_FILTER_LABELS, BRAND_FILTERS, parseBrandFilter } from '@sellery/db/admin/brand-rules';
import { gradeChips } from '@sellery/db/admin/seller-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, grantBrandCelery, listBrands, rateLimit, setBrandAutoPropose } from '$lib/server/partners';

/**
 * `/brands` — 브랜드 목록 (데모 `(demo)/brands` · 프로토타입 `vAdminBrands` 의 DB 판).
 * load: `requireAdmin` → `listBrands({ filter, grade, q })`. 상단 띠 · 상태 필터 · 등급 필터 · 검색 · 표(누적 GMV 내림차순).
 * 목록 액션 2개(데모와 같은 자리) — 되돌리기 쉬운 것만. **정지·복귀는 상세에서만**:
 *   `?/auto`   자동 제안 ON/OFF
 *   `?/grant`  🥬 지급 (멱등이 아니라 화면에서 confirm)
 */
const RATE = 30;

function selfWithQuery(url: URL, msg?: string): string {
	const p = new URLSearchParams();
	for (const k of ['filter', 'grade', 'q'] as const) {
		const v = url.searchParams.get(k);
		if (v) p.set(k, v);
	}
	if (msg) p.set('msg', msg);
	const qs = p.toString();
	return qs ? `${adminPath('/brands')}?${qs}` : adminPath('/brands');
}

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const filter = parseBrandFilter(event.url.searchParams.get('filter'));
	const grade = event.url.searchParams.get('grade');
	const q = (event.url.searchParams.get('q') ?? '').trim();
	const { rows, counts, grades } = await listBrands({ filter, grade, q: q || null });

	const self = adminPath('/brands');
	const key = event.url.searchParams.get('msg') ?? '';
	const msg = key === 'err_rate' ? RATE_LIMIT_MESSAGE : key ? (BRAND_ACTION_MESSAGES[key] ?? null) : null;

	const chipHref = (patch: Record<string, string | null>) => {
		const p = new URLSearchParams();
		const cur: Record<string, string | null> = { filter: filter === 'all' ? null : filter, grade, q: q || null, ...patch };
		for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
		const qs = p.toString();
		return qs ? `${self}?${qs}` : self;
	};

	return {
		rows,
		counts,
		filter,
		grade,
		q,
		msg,
		msgTone: key.startsWith('err') ? ('danger' as const) : ('ok' as const),
		self,
		productsPath: adminPath('/products'),
		statusChips: BRAND_FILTERS.map((f) => ({
			key: f,
			label: BRAND_FILTER_LABELS[f],
			count: f === 'all' ? counts.all : f === 'suspended' ? counts.suspended : f === 'no_settle_info' ? counts.noSettleInfo : f === 'pending_product' ? counts.pendingProduct : null,
			href: chipHref({ filter: f === 'all' ? null : f })
		})),
		gradeChips: [{ key: '', label: '전체 등급', count: counts.all, href: chipHref({ grade: null }) }, ...gradeChips(grades).map((g) => ({ ...g, href: chipHref({ grade: g.key }) }))]
	};
};

async function guard(event: RequestEvent, bucket: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	if (!rateLimit(`${bucket}:${gate.ctx.user.id}`, RATE)) redirect(303, selfWithQuery(event.url, 'err_rate'));
	return gate;
}

export const actions: Actions = {
	auto: async (event) => {
		await guard(event, 'admin-brand-auto');
		const form = await event.request.formData();
		const ref = String(form.get('brand') ?? '').trim();
		const on = form.get('on') === 'true';
		if (!ref) redirect(303, selfWithQuery(event.url, 'err_input'));
		const res = await setBrandAutoPropose(ref, on);
		redirect(303, selfWithQuery(event.url, res.code));
	},

	grant: async (event) => {
		await guard(event, 'admin-brand-grant');
		const form = await event.request.formData();
		const ref = String(form.get('brand') ?? '').trim();
		if (!ref) redirect(303, selfWithQuery(event.url, 'err_input'));
		const res = await grantBrandCelery(ref);
		redirect(303, selfWithQuery(event.url, res.code));
	}
};
