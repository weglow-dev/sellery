import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSellerCsThread } from '$lib/server/cs';
import { requireSeller } from '$lib/server/seller';

/** 고객 문의 1건(0063 스레드 · actor='seller' — 내 상품 문의만). 남의 문의 · 없는 코드 → CS 관리 고객 문의 목록 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const thread = await getSellerCsThread(seller.id, event.params.code);
	if (!thread) redirect(303, '/cs?view=inquiry');
	return { thread };
};
