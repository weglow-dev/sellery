import type { LayoutServerLoad } from './$types';
import { creatorStyle } from '@sellery/myr-core/creator';
import { requireSeller } from '$lib/server/seller';

/** 콘솔 셸 — 로그인한 크리에이터(`sellers` 행)를 화면에 넘긴다(목 `ME` 대신). 게이트는 requireSeller(로그인 · 연결 · 정지).
 *  페이지 load 가 생기면 각 페이지도 requireSeller 를 직접 부른다 — 요청당 DB 조회는 한 번(locals 메모). */
export const load: LayoutServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const style = creatorStyle(seller);
	return {
		me: { id: seller.id, name: seller.name, handle: seller.handle, avatarUrl: seller.avatarUrl, initial: style.initial, avatarBg: style.bg }
	};
};
