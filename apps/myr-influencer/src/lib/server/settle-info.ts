/** 사업자 · 정산 정보(9번 · 0085) — `@sellery/myr-core/server/settle-info` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음. */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { getSettleInfoOfUser, type SettleInfo } from '@sellery/myr-core/server/settle-info';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/settle-info';

/** 게이트(requireSeller)와 정보 조회를 **동시에** 보내고, 게이트가 통과할 때만 돌려준다(claims.ts myClaims 와 같은 방식) */
export async function mySettleInfo(event: RequestEvent): Promise<{ seller: SellerSummary; info: SettleInfo | null }> {
	const { user } = await event.locals.safeGetSession();
	const infoP = user ? getSettleInfoOfUser(user.id) : Promise.resolve(null);
	infoP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, info: await infoP };
}
