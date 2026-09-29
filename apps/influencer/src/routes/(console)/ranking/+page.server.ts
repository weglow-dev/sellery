import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRanking, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/ranking` — 인플루언서 랭킹 (프로토타입 `(demo)/rank/+page.svelte` · 0026 `app_seller_ranking`).
 * load: `requireSeller` → `getRanking(seller.id)` RPC 1회 — 내 등급 카드(상위 n% · 다음 등급까지) +
 *   등급별 혜택 표 + 리더보드(3개월 매출 · 매출/팔로워 · 매출/좋아요 · 등급).
 *
 * **익명**: 리더보드는 본인 외 전원 ○○○ 이다 — RPC 가 남의 이름·핸들을 아예 담지 않고(0026),
 *   파서가 한 번 더 덮는다(`parseRanking`). 화면은 `anonLabel` 로 표시한다.
 * 정지된 인플루언서(`active=false`)는 순위에서 빠진다 — 판매할 수 없는 상태라 순위에 남기지 않는다(0026 주석).
 * RPC 실패(null)는 빈 화면 + 안내(`failed`) — 매출 화면과 같은 방식.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/ranking' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const ranking = await getRanking(seller.id);

	return {
		seller: { name: seller.name, grade: seller.grade },
		balance,
		ranking,
		failed: ranking === null,
		salesPath: sellerPath('/sales'),
		refPath: sellerPath('/referral')
	};
};
