import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { claimQuotes, getSellerClaimOfUser } from '$lib/server/claims';
import { requireSeller } from '$lib/server/seller';

/** 교환 · 환불 요청 1건(0078 · 내 상품 요청만) + 고객 사진 서명 URL + 예상 환불 금액(claimQuotes — 실제 환불과 같은 계산 · 마지막 줄이면 배송비 포함).
 *  남의 요청 · 없는 코드 → CS 관리 교환 · 환불 목록. [id] = 요청 코드(rq2001) */
export const load: PageServerLoad = async (event) => {
	await requireSeller(event);
	const { user } = await event.locals.safeGetSession();
	const found = user ? await getSellerClaimOfUser(user.id, event.params.id) : null;
	if (!found) redirect(303, '/cs');
	return { claim: found.claim, photoUrls: found.photoUrls, quotes: await claimQuotes(found.claim) };
};
