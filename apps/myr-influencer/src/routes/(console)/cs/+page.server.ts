import type { PageServerLoad } from './$types';
import { myInquiries } from '$lib/server/cs';

/** CS 관리 — 고객 문의 목록(0075 · 내 상품 문의만 · 답변 대기 → 답변 완료 순 · 최근순 ≤ 200). 교환·환불(7번)은 아직 목(app.cs) */
export const load: PageServerLoad = async (event) => {
	const { rows } = await myInquiries(event);
	return { inquiries: rows };
};
