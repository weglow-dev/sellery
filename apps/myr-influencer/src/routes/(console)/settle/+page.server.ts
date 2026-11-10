import type { PageServerLoad } from './$types';
import { mySettlements } from '$lib/server/settlement';

/** 정산(0089) — 다음 정산 예정 · 제품별 제조 원장 · 월별 정산 내역. 계산은 DB(0087 · 0089) — 화면은 보여 주기만. 게이트와 조회를 동시에 보낸다 */
export const load: PageServerLoad = async (event) => {
	const { data } = await mySettlements(event);
	return { settle: data };
};
