/**
 * 크리에이터 정산 탭(0089) — `@sellery/myr-core/server/settlement` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * mySettlements(event): 크리에이터 게이트(requireSeller)와 계정 기준 정산 조회를 **동시에** 보내고, 게이트가 통과할 때만 돌려준다(orders.ts myOrders 와 같은 방식).
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { emptySellerSettlements, type SellerSettlements } from '@sellery/myr-core/seller-settlement';
import type { SettleInfo } from '@sellery/myr-core/settle-info';
import { getSellerSettlementsOfUser } from '@sellery/myr-core/server/settlement';
import { getSettleInfoOfUser } from '@sellery/myr-core/server/settle-info';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/settlement';

/** info — 사업자 · 정산 정보(0085 · 0126): 정산 탭 토스 배너(홈 배너와 같은 homeSettleBanner) · 정산 상세 "지급까지 할 일" ③ 토스 본인인증(payout_toss · toss_ask).
 *  실패해도 정산 화면은 뜬다(배너 · ③ 없이) */
export async function mySettlements(event: RequestEvent): Promise<{ seller: SellerSummary; data: SellerSettlements; info: SettleInfo | null }> {
	const { user } = await event.locals.safeGetSession();
	const dataP = user ? getSellerSettlementsOfUser(user.id) : Promise.resolve(emptySellerSettlements());
	const infoP: Promise<SettleInfo | null> = user
		? getSettleInfoOfUser(user.id).catch((e) => {
				console.error('[settle] settle info failed:', e instanceof Error ? e.message : e);
				return null;
			})
		: Promise.resolve(null);
	dataP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, data: await dataP, info: await infoP };
}
