import type { PageServerLoad } from './$types';
import { mySettleInfo } from '$lib/server/settle-info';

/** 내 정보(9번 · 0085) — 프로필(읽기) · 사업자 · 정산 정보(가린 값 · 운영 확인 상태). 게이트와 정보 조회를 동시에 보낸다 */
export const load: PageServerLoad = async (event) => {
	const { seller, info } = await mySettleInfo(event);
	return { seller: { name: seller.name, handle: seller.handle, email: seller.email }, info };
};
