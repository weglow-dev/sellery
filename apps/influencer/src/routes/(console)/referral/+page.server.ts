import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getReferral, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/referral` — 추천 프로그램 (프로토타입 `(demo)/ref/+page.svelte` · 0026 `app_seller_referral`).
 * load: `requireSeller` → `getReferral(seller.id)` RPC 1회 — 내 추천 코드 · 누적 수익 · 추천 인원 ·
 *   인플루언서별 (보상 판매 진행 n/5 · 발생 수익) · 내가 피추천인이면 부스트 남은 횟수.
 *
 * 보상 금액은 **정산이 이미 적재한 값**이다(`referral_earnings` · 0020:652) — 이 화면은 읽기만 한다.
 * 진행 횟수는 정산(0020:366)과 같은 식(`LIVE/CLEARING/SETTLED` 캠페인 생성일순 첫 REF_TIMES 회).
 * 추천한 인플루언서는 **실명**이다 — 내가 직접 데려온 사람이고 프로토타입도 실명이다(랭킹의 익명 규칙은
 * "모르는 남" 에 대한 것).
 * RPC 실패(null)는 빈 화면 + 안내(`failed`).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/referral' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const referral = await getReferral(seller.id);

	return {
		balance,
		referral,
		failed: referral === null,
		rankPath: sellerPath('/ranking'),
		settlePath: sellerPath('/settle')
	};
};
