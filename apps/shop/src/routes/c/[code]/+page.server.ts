import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canonicalStoreUrl } from '@sellery/db/campaign';
import { fetchCampaignCard } from '$lib/server/db';

/**
 * 짧은 주소 `/c/[code]` → 정식 주소 308 (app-plan §6.1 · web c/[code]/page.tsx).
 * 렌더 없음: campaign_card(code) 가 null 이면 404(고객 셸의 +error.svelte 한 번에), 있으면 redirect(308, canonicalStoreUrl) — '@' 없는 핸들.
 * `+server.ts` 가 아니라 `+page.server.ts` 인 이유: 없는 코드의 404 가 헤더·푸터 있는 고객 셸 카드로 나가야 한다(web 과 동일). 308 은 둘 다 같다.
 */
export const load: PageServerLoad = async (event) => {
	const card = await fetchCampaignCard(event, event.params.code);
	if (!card) error(404, { message: '판매 페이지를 찾을 수 없습니다' });
	redirect(308, canonicalStoreUrl(card));
};
