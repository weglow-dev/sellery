import type { LayoutServerLoad } from './$types';
import { creatorStyle } from '@sellery/myr-core/creator';
import { requireSeller } from '$lib/server/seller';

/** 콘솔 셸 — 로그인한 크리에이터(`sellers` 행)를 화면에 넘긴다(목 `ME` 대신). 게이트는 requireSeller(로그인 · 연결 · 정지).
 *  **주소를 추적하지 않는다**(`event.untrack`) — 그래야 이 load 가 첫 진입 · 새로고침에만 돌고, 탭 이동(홈 · CS · 내 제품)은 서버 요청 없이 바로 넘어간다(2026-11-04).
 *  그래서 정지 · 연결 해제는 다음 진입 때 반영된다 — 데이터를 주는 페이지 load · form action 은 각자 requireSeller 를 직접 부른다(요청당 DB 조회는 한 번 · locals 메모). */
export const load: LayoutServerLoad = async (event) => {
	const seller = await requireSeller(event, event.untrack(() => event.url.pathname + event.url.search));
	const style = creatorStyle(seller);
	return {
		me: { id: seller.id, name: seller.name, handle: seller.handle, avatarUrl: seller.avatarUrl, initial: style.initial, avatarBg: style.bg }
	};
};
