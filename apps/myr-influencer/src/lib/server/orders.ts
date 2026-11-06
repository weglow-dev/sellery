/**
 * 주문 열람(6번 · 0081) — `@sellery/myr-core/server/seller-orders` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * myOrders(event): 크리에이터 게이트(requireSeller)와 계정 기준 주문 목록을 **동시에** 보내고, 게이트가 통과할 때만 목록을 돌려준다(claims.ts myClaims 와 같은 방식).
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { listSellerOrdersOfUser, type SellerOrder } from '@sellery/myr-core/server/seller-orders';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/seller-orders';

export async function myOrders(event: RequestEvent): Promise<{ seller: SellerSummary; rows: SellerOrder[] }> {
	const { user } = await event.locals.safeGetSession();
	const rowsP = user ? listSellerOrdersOfUser(user.id) : Promise.resolve<SellerOrder[]>([]);
	rowsP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, rows: await rowsP };
}
