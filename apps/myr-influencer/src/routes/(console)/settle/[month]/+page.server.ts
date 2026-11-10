import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { SettleItem } from '@sellery/myr-core/seller-settlement';
import { listSellerSettlementItemsOfUser, listSellerSettlePreviewItemsOfUser, mySettlements } from '$lib/server/settlement';

/** 정산 상세(0089 · 시안 SETTLEMENT DETAIL) — `/settle/next` = 다음 정산(예상) · `/settle/YYYY-MM` = 확정된 회차. 상품별 내역 + 주문 줄(판매 내역).
 *  없는 회차 · 형식이 틀린 주소는 정산 목록으로. 게이트 · 정산 · 주문 줄을 동시에 보낸다(크리에이터는 세션에서만 · 결정 3) */
export const load: PageServerLoad = async (event) => {
	const key = event.params.month;
	if (key !== 'next' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) redirect(303, '/settle');
	const { user } = await event.locals.safeGetSession();
	const itemsP: Promise<SettleItem[]> = !user ? Promise.resolve([]) : key === 'next' ? listSellerSettlePreviewItemsOfUser(user.id) : listSellerSettlementItemsOfUser(user.id, `${key}-01`);
	itemsP.catch(() => {}); // 게이트가 redirect 를 던지면 기다리지 않는다
	const { data } = await mySettlements(event);
	if (key !== 'next' && !data.months.some((m) => m.month === key)) redirect(303, '/settle');
	return { settle: data, key, items: await itemsP };
};
