import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getAdminRevenue, saveOpex } from '$lib/server/money';
import { OPEX_FALLBACK, OPEX_MESSAGES, parseOpexForm } from '@sellery/db/admin/revenue-rules';

/**
 * `/revenue` — 매출·순수익. 데모 `(demo)/revenue`(프로토타입 `vAdminRevenue`)의 실서비스 판.
 *
 * 금액은 `app_admin_revenue()`(0022) 가 계산한다 — 정산 규칙을 여기서 다시 구현하지 않는다.
 * 운영 비용만 화면 입력이고, 저장은 `platform_settings.opex_default` 한 행에 쓴다.
 *
 * **GMV 정의가 대시보드와 다르다** — 이 화면은 샘플 구매만 있는 캠페인(`SAMPLE_PURCHASED`)도 넣는다
 * (데모와 같다 · sample-policy §169). 대시보드는 `LIVE`·`CLEARING`·`SETTLED` 만 센다(§172).
 * 화면에 두 기준을 적어 운영이 차이를 헷갈리지 않게 한다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const view = await getAdminRevenue();

	return {
		view,
		msg: event.url.searchParams.get('msg'),
		homePath: adminPath('/home'),
		campaignsPath: adminPath('/campaigns'),
		settlePath: adminPath('/settle')
	};
};

export const actions: Actions = {
	/** 운영 비용 저장 · 재계산 (데모 act.saveOpex) */
	saveOpex: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const fd = await event.request.formData();
		const r = await saveOpex(parseOpexForm(fd));
		if (!r.ok) return fail(400, { opexError: OPEX_MESSAGES[`err_${r.code}`] ?? OPEX_MESSAGES.err_DB_ERROR });
		redirect(303, `${event.url.pathname}?msg=saved`);
	},

	/** 기본값으로 되돌리기 (데모 act.resetOpex) */
	resetOpex: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const r = await saveOpex(OPEX_FALLBACK);
		if (!r.ok) return fail(400, { opexError: OPEX_MESSAGES[`err_${r.code}`] ?? OPEX_MESSAGES.err_DB_ERROR });
		redirect(303, `${event.url.pathname}?msg=reset`);
	}
};
