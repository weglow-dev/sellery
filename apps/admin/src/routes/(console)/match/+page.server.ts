import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getAdminMatch, runAutoPropose, toggleAutoPropose } from '$lib/server/partners';
import { AUTO_PROPOSE_BATCH, autoProposeSummary } from '@sellery/db/admin/match-rules';

/**
 * `/match` — 매칭 · 자동 제안. 데모 `(demo)/match`(프로토타입 `vAdminMatch` · `runAutoPropose`)의 실서비스 판.
 *
 * 발송은 브랜드 RPC `app_brand_invite_seller`(0016)를 **대행 호출**한다 — 게이트(비공개 · 우선권 등급 ·
 * 독점 · 중복)는 그 RPC 가 판단하고, 성공한 건에 `auto_proposed=true` 와 대행 기록(`admin_proxy_action`)을 남긴다.
 *
 * 실행 결과는 행별로 보여줘야 해서(일부 성공 · 일부 실패) `?msg=` 로 넘기지 않고 `fail`/반환값으로 화면에 준다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const view = await getAdminMatch();

	return {
		view,
		batch: AUTO_PROPOSE_BATCH,
		paths: {
			sellers: adminPath('/sellers'),
			brands: adminPath('/brands'),
			products: adminPath('/products'),
			campaigns: adminPath('/campaigns')
		}
	};
};

export const actions: Actions = {
	/** 브랜드 자동 제안 ON/OFF (데모 act.toggleAutoPropose) */
	toggle: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const fd = await event.request.formData();
		const r = await toggleAutoPropose(String(fd.get('brand') ?? ''), String(fd.get('on') ?? '') === '1');
		if (!r.ok) return fail(400, { toggleError: r.code === 'NOT_FOUND' ? '브랜드를 찾을 수 없습니다' : '변경에 실패했습니다' });
		return { toggled: true };
	},

	/** 오늘 자동 제안 실행 — 후보 상위 N 건 (데모 act.runAutoPropose) */
	run: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const r = await runAutoPropose(gate.ctx.user.id, AUTO_PROPOSE_BATCH);
		if (!r.ok) return fail(400, { runError: '발송에 실패했습니다. 잠시 후 다시 시도해주세요.' });
		return { rows: r.rows, summary: autoProposeSummary(r.rows) };
	}
};
