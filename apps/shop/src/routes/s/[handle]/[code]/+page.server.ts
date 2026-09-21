import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canonicalStoreUrl, isEnded, normalizeHandle, ogImageSrc } from '@sellery/db/campaign';
import { absoluteUrl, fetchCampaignCard, fetchSellerOtherCampaigns } from '$lib/server/db';

/**
 * 판매 링크 페이지 `/s/[handle]/[code]` 데이터 — web s/[handle]/[code]/page.tsx 1:1 (프로토타입 vStore · ux-spec §3.1 · app-plan §6.1 · docs/monorepo-migration.md §4.1).
 *   · anon campaign_card(code) → null 이면 404 (+error.svelte "판매 페이지를 찾을 수 없습니다")
 *   · URL 핸들이 정식 핸들(normalizeHandle(seller.handle) — '@' 없음)과 다르면 308 canonicalStoreUrl (정식 URL 재요청은 raw 세그먼트 === 정식 핸들이라 200 — 무한 리다이렉트 없음)
 *   · 쿠키·재고를 읽으므로 캐시하지 않는다(SSR 기본). 링크 쿠키는 hooks.server.ts 가 이 경로에서 세팅한다.
 *   · 메타(generateMetadata 대체)는 데이터로 넘기고 +page.svelte 의 <svelte:head> 가 렌더한다 (§3.4).
 */
export const load: PageServerLoad = async (event) => {
	const { handle, code } = event.params;
	const card = await fetchCampaignCard(event, code);
	if (!card) error(404, { message: '판매 페이지를 찾을 수 없습니다' });
	if (handle !== normalizeHandle(card.seller.handle)) redirect(308, canonicalStoreUrl(card));

	const [others, parentData] = await Promise.all([fetchSellerOtherCampaigns(event, card.seller.id, card.campaign.id), event.parent()]);

	const ended = isEnded(card.campaign, card.campaign.today);
	const og = ogImageSrc(card.product.thumb_url);
	const description = [card.product.description, card.brand.name, `${card.seller.name}님의 셀러리 인증 판매`].filter(Boolean).join(' · ');
	const canonical = absoluteUrl(canonicalStoreUrl(card));

	return {
		card,
		others,
		signedIn: parentData.user !== null,
		meta: {
			title: `${card.product.name} · ${card.seller.name}`,
			description,
			canonical,
			ogImage: og ? absoluteUrl(og) : null,
			noindex: ended
		}
	};
};
