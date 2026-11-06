/**
 * 교환 · 환불 요청(7번 · 0078) — `@sellery/myr-core/server/claims` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * myClaims(event): 크리에이터 게이트(requireSeller)와 계정 기준 요청 목록을 **동시에** 보내고, 게이트가 통과할 때만 목록을 돌려준다(cs.ts myInquiries 와 같은 방식).
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import type { Claim } from '@sellery/myr-core/claim-rules';
import { listSellerClaimsOfUser, sellerClaimsWaitingOfUser } from '@sellery/myr-core/server/claims';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/claims';

export async function myClaims(event: RequestEvent): Promise<{ seller: SellerSummary; rows: Claim[] }> {
	const { user } = await event.locals.safeGetSession();
	const rowsP = user ? listSellerClaimsOfUser(user.id) : Promise.resolve<Claim[]>([]);
	rowsP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, rows: await rowsP };
}

/** 처리 대기 수(내비 · 홈 뱃지) — 게이트와 동시에 보내는 쪽이 부른다. 세션이 없으면 0 */
export async function myClaimWaiting(event: RequestEvent): Promise<number> {
	const { user } = await event.locals.safeGetSession();
	return user ? sellerClaimsWaitingOfUser(user.id) : 0;
}
