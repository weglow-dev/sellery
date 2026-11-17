import type { PageServerLoad } from './$types';
import type { Claim } from '@sellery/myr-core/claim-rules';
import { listSellerClaimsOfUser, myClaimWaiting } from '$lib/server/claims';
import { myInquiries, myInquiryWaiting } from '$lib/server/cs';

/** CS 관리 — 교환 · 환불 요청(0078 · 내 상품 요청만 · 처리 대기 → 진행 중 → 최근순 ≤ 200) + 고객 문의(0075). 게이트(myInquiries)와 요청 목록을 동시에 보낸다.
 *  대기 수는 서버 함수(0116 myr_claim_waiting · myr_cs_waiting · 레이아웃 뱃지와 같은 값) — 목록(200건까지)을 다시 세지 않는다 */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.locals.safeGetSession();
	const claimsP: Promise<Claim[]> = user
		? listSellerClaimsOfUser(user.id).catch((e) => {
				console.error('[cs] claims failed:', e instanceof Error ? e.message : e);
				return [];
			})
		: Promise.resolve([]);
	const claimWaitingP = myClaimWaiting(event);
	const inqWaitingP = myInquiryWaiting(event);
	const { rows } = await myInquiries(event);
	return { inquiries: rows, claims: await claimsP, claimWaiting: await claimWaitingP, inqWaiting: await inqWaitingP };
};
