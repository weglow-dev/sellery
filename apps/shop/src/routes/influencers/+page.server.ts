import type { PageServerLoad } from './$types';
import { isCat } from '@sellery/db/campaign';
import { filterSellers, isSellerPlatform, sellerCampaignStats, sellerCounts } from '@sellery/db/sellers';
import { absoluteUrl, fetchHomeCampaigns, fetchPublicSellerProfiles, readLinkCtx } from '$lib/server/db';

/**
 * 고객 `/influencers` — 셀러리 인증 인플루언서 목록 (프로토타입 vCustInfluencers · docs/app-plan.md §6.1).
 *   입력: ?platform= (instagram|youtube|naver|tiktok) · ?cat= (CATS) · 쿠키 slry_linkctx (readLinkCtx)
 *   데이터: anon fetchPublicSellerProfiles(sellers 공개 컬럼 · 인증된 메인 채널 inner 조인 · hidden 은 RLS) + fetchHomeCampaigns(홈과 같은 조인) 로 인플루언서별 진행 중·오픈 예정·완료 건수와 LIVE 링크.
 *   링크 보호(app-plan §8): 목록은 전원 노출(홈의 인플루언서 칩과 동일), 건수·LIVE 링크는 custVisible 통과분만 + 안내문. 칩 건수는 전체 기준.
 *   PUBLIC_SUPABASE_* 가 비면 빈 목록으로 렌더(빈 상태 문구).
 */
export const load: PageServerLoad = async (event) => {
	const platformParam = event.url.searchParams.get('platform');
	const catParam = event.url.searchParams.get('cat');
	const platform = isSellerPlatform(platformParam) ? platformParam : null;
	const cat = isCat(catParam) && catParam !== '전체' ? catParam : null;

	const [all, cards, L] = await Promise.all([fetchPublicSellerProfiles(event), fetchHomeCampaigns(event), readLinkCtx(event).catch(() => null)]);

	const list = filterSellers(all, { platform, cat }).map((s) => ({ s, stats: sellerCampaignStats(cards, s.id, L) }));

	return {
		platform,
		cat,
		total: all.length,
		counts: sellerCounts(all),
		list,
		link: L ? { sellerName: L.sellerName } : null,
		canonical: absoluteUrl('/influencers')
	};
};
