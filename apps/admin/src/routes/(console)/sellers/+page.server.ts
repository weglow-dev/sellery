import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { SELLER_ACTION_MESSAGES, SELLER_FILTER_LABELS, SELLER_FILTERS, gradeChips, parseSellerFilter } from '@sellery/db/admin/seller-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, grantCelery, listSellers, rateLimit, setSellerHidden } from '$lib/server/partners';

/**
 * `/sellers` — 인플루언서 목록 (docs/admin-console-plan.md "파트너 관리" · 데모 `(demo)/influencers` 의 DB 판).
 * load: `requireAdmin` → `listSellers({ filter, grade, q })`. 상단 띠 · 상태 필터 칩 · 등급 필터 칩 · 검색 · 표.
 * 목록 액션 2개(데모와 같은 자리) — 되돌리기 쉬운 것만 둔다. **정지 · 채널 인증은 상세에서만**:
 *   `?/hidden`  공개 ↔ 비공개  (즉시 되돌릴 수 있다)
 *   `?/grant`   🥬 지급        (멱등이 아니라 화면에서 confirm)
 * 액션은 `?msg=` 로 결과를 돌려주고 load 가 문구로 바꾼다. 쿼리(filter · grade · q)는 리다이렉트에 유지한다.
 */
const RATE = 30;

/** 현재 목록 화면으로 돌아가는 URL — 필터·검색을 잃지 않는다 */
function selfWithQuery(url: URL, msg?: string): string {
	const p = new URLSearchParams();
	for (const k of ['filter', 'grade', 'q'] as const) {
		const v = url.searchParams.get(k);
		if (v) p.set(k, v);
	}
	if (msg) p.set('msg', msg);
	const qs = p.toString();
	return qs ? `${adminPath('/sellers')}?${qs}` : adminPath('/sellers');
}

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const filter = parseSellerFilter(event.url.searchParams.get('filter'));
	const grade = event.url.searchParams.get('grade');
	const q = (event.url.searchParams.get('q') ?? '').trim();
	const { rows, counts, grades } = await listSellers({ filter, grade, q: q || null });

	const self = adminPath('/sellers');
	const key = event.url.searchParams.get('msg') ?? '';
	const msg = key === 'err_rate' ? RATE_LIMIT_MESSAGE : key ? (SELLER_ACTION_MESSAGES[key] ?? null) : null;

	/** 칩 href — 다른 조건은 유지하고 하나만 바꾼다 */
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
		statusChips: SELLER_FILTERS.map((f) => ({
			key: f,
			label: SELLER_FILTER_LABELS[f],
			count: f === 'all' ? counts.all : f === 'suspended' ? counts.suspended : f === 'hidden' ? counts.hidden : f === 'pending_channel' ? counts.pendingChannel : null,
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
	hidden: async (event) => {
		await guard(event, 'admin-seller-hidden');
		const form = await event.request.formData();
		const ref = String(form.get('seller') ?? '').trim();
		const hidden = form.get('hidden') === 'true';
		if (!ref) redirect(303, selfWithQuery(event.url, 'err_input'));
		const res = await setSellerHidden(ref, hidden);
		redirect(303, selfWithQuery(event.url, res.code));
	},

	grant: async (event) => {
		await guard(event, 'admin-seller-grant');
		const form = await event.request.formData();
		const ref = String(form.get('seller') ?? '').trim();
		if (!ref) redirect(303, selfWithQuery(event.url, 'err_input'));
		const res = await grantCelery(ref);
		redirect(303, selfWithQuery(event.url, res.code));
	}
};
