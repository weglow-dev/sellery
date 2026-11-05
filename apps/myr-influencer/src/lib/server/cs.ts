/**
 * 고객 문의(5번 · 0075) — `@sellery/myr-core/server/cs` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * myInquiries(event): 크리에이터 게이트(requireSeller)와 계정 기준 문의 목록을 **동시에** 보내고, 게이트가 통과할 때만 목록을 돌려준다(seller-products myProducts 와 같은 방식).
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import type { CsConversation } from '@sellery/myr-core/cs-rules';
import { listSellerCsOfUser, sellerCsWaitingOfUser } from '@sellery/myr-core/server/cs';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/cs';

export async function myInquiries(event: RequestEvent): Promise<{ seller: SellerSummary; rows: CsConversation[] }> {
	const { user } = await event.locals.safeGetSession();
	const rowsP = user ? listSellerCsOfUser(user.id) : Promise.resolve<CsConversation[]>([]);
	rowsP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다
	const seller = await requireSeller(event);
	return { seller, rows: await rowsP };
}

/** 답변 대기 수(내비 · 홈 뱃지) — 게이트와 동시에 보내는 쪽이 부른다. 세션이 없으면 0 */
export async function myInquiryWaiting(event: RequestEvent): Promise<number> {
	const { user } = await event.locals.safeGetSession();
	return user ? sellerCsWaitingOfUser(user.id) : 0;
}
