import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { BRAND_ACTION_MESSAGES } from '@sellery/db/admin/brand-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, getBrand, grantBrandCelery, rateLimit, setBrandActive, setBrandAutoPropose } from '$lib/server/partners';

/**
 * `/brands/[code]` — 브랜드 상세 · 운영 액션 (docs/admin-console-plan.md "파트너 관리").
 * load: `requireAdmin` → `getBrand(code)`. 없으면 404. `code` 는 `brands.code`('b1') 또는 uuid.
 * 액션 3개 — 전부 `requireAdmin` 재확인 + 레이트리밋. **대상은 URL 파라미터만 신뢰**:
 *   `?/active`  정지 · 복귀      `setBrandActive`      — listed 상품은 내려가지 않는다(brand-console-plan §8)
 *   `?/auto`    자동 제안 ON/OFF `setBrandAutoPropose`
 *   `?/grant`   🥬 지급          `grantBrandCelery`
 * 계좌 원문은 여기서 읽지 않는다 — 등록 여부만(계획서 M6).
 */
const RATE = 30;

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const brand = await getBrand(event.params.code);
	if (!brand) error(404, { message: '브랜드를 찾을 수 없습니다' });

	const key = event.url.searchParams.get('msg') ?? '';
	const msg = key === 'err_rate' ? RATE_LIMIT_MESSAGE : key ? (BRAND_ACTION_MESSAGES[key] ?? null) : null;

	return {
		brand,
		msg,
		msgTone: key.startsWith('err') ? ('danger' as const) : ('ok' as const),
		self: `${adminPath('/brands')}/${encodeURIComponent(event.params.code)}`,
		listPath: adminPath('/brands'),
		productsPath: adminPath('/products')
	};
};

async function guard(event: RequestEvent, bucket: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	const self = `${adminPath('/brands')}/${encodeURIComponent(event.params.code)}`;
	if (!rateLimit(`${bucket}:${gate.ctx.user.id}`, RATE)) redirect(303, `${self}?msg=err_rate`);
	return self;
}

export const actions: Actions = {
	active: async (event) => {
		const self = await guard(event, 'admin-brand-active');
		const form = await event.request.formData();
		const active = form.get('active') === 'true';
		const reason = String(form.get('reason') ?? '').slice(0, 200);
		const res = await setBrandActive(event.params.code, active, reason);
		redirect(303, `${self}?msg=${res.code}`);
	},

	auto: async (event) => {
		const self = await guard(event, 'admin-brand-auto');
		const form = await event.request.formData();
		const on = form.get('on') === 'true';
		const res = await setBrandAutoPropose(event.params.code, on);
		redirect(303, `${self}?msg=${res.code}`);
	},

	grant: async (event) => {
		const self = await guard(event, 'admin-brand-grant');
		const res = await grantBrandCelery(event.params.code);
		redirect(303, `${self}?msg=${res.code}`);
	}
};
