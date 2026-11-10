/**
 * 크리에이터 정산 탭(0089) — `@sellery/myr-core/server/settlement` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * mySettlements(event): 크리에이터 게이트(requireSeller)와 계정 기준 정산 조회를 **동시에** 보내고, 게이트가 통과할 때만 돌려준다(orders.ts myOrders 와 같은 방식).
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { emptySellerSettlements, type SellerSettlements } from '@sellery/myr-core/seller-settlement';
import { getSellerSettlementsOfUser } from '@sellery/myr-core/server/settlement';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/settlement';

export async function mySettlements(event: RequestEvent): Promise<{ seller: SellerSummary; data: SellerSettlements }> {
	const { user } = await event.locals.safeGetSession();
	const dataP = user ? getSellerSettlementsOfUser(user.id) : Promise.resolve(emptySellerSettlements());
	dataP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, data: await dataP };
}
