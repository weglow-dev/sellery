import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/admin';

/**
 * 관리자 홈 — **스텁**. 이 PR 의 목적은 `requireAdmin()` 이 실제로 동작함을 확인할 수 있는 최소 화면이다.
 * 실제 기능(인플루언서 관리 · 채널 인증 승인 · 상품 검수 · 정산 실행)은 다음 단계에서 이 아래에 붙인다.
 * hooks 세션 게이트는 아직 없다(다음 PR) — 지금은 이 page 의 requireAdmin 이 유일한 방어선이고, 그것으로 충분하다(결정 6: 게이트는 page 가 한다).
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	return { email: gate.ctx.user.email ?? null };
};
