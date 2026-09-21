import type { PageServerLoad } from './$types';
import { CATS, DEFAULT_SETTINGS, isCat, isHomeFeat, type HomeCard } from '@sellery/db/campaign';
import { custVisible } from '@sellery/db/linkctx';
import { kstToday } from '@sellery/db/dates';
import { fetchCampaignCard, fetchHomeCampaigns, fetchPublicSellers, fetchPublicStats, readLinkCtx } from '$lib/server/db';

/**
 * 고객 홈 `/` 데이터 — web (customer)/page.tsx 1:1 (프로토타입 vCustHome · ux-spec §3.2 · app-plan §6.1 최소판 · docs/monorepo-migration.md §4.1).
 *   입력: ?cat= (기본 '전체') · ?seller= (seller.code) · 쿠키 slry_linkctx (readLinkCtx → custVisible 필터)
 *   데이터: anon 조인 fetchHomeCampaigns · fetchPublicSellers · public_stats(60초 메모) · 세션(레이아웃 parent — 하단 카드)
 *   링크 보호(app-plan §8): 진행 중·오픈 예정·카테고리 건수·순위에 custVisible 적용. 보호 중에는 타 인플루언서 ★ 추천 상단 고정 해제.
 *   PUBLIC_SUPABASE_* 가 비어 있으면(hooks 가 locals.supabase = null) 전부 빈 목록·0 으로 렌더 — 빌드·CI 더미 env 에서도 죽지 않는다.
 */
export const load: PageServerLoad = async (event) => {
	const catParam = event.url.searchParams.get('cat');
	const cat = isCat(catParam) ? catParam : '전체';
	const sellerCode = event.url.searchParams.get('seller')?.trim() || null;

	const [all, pubSellers, stats, L, parentData] = await Promise.all([
		fetchHomeCampaigns(event),
		fetchPublicSellers(event),
		fetchPublicStats(),
		readLinkCtx(event).catch(() => null),
		event.parent()
	]);
	// 보호 중인 링크의 정책값(link_protect_days · home_feature_days) — campaign_card 는 요청당 메모라 readLinkCtx 와 중복 비용이 작다
	const linkCard = L ? await fetchCampaignCard(event, L.code) : null;
	const settings = linkCard?.settings ?? DEFAULT_SETTINGS;
	const today = stats.today ?? kstToday();
	const protectedSellerId = L?.sellerId ?? null;

	const visible = all.filter((c) => custVisible({ seller_id: c.seller_id, product_id: c.product_id, category: c.product.category }, L));
	const sel = sellerCode ? (pubSellers.find((s) => s.code === sellerCode) ?? null) : null;
	const inSel = (c: HomeCard) => !sel || c.seller_id === sel.id;
	const inCat = (c: HomeCard) => cat === '전체' || c.product.category === cat;
	/** 링크 보호 중 정렬 키: 타 인플루언서의 ★ 추천은 상단 고정하지 않는다 (제안서 "다른 브랜드의 추천·배너 ✕") — web page.tsx featOf */
	const allowFeat = (c: HomeCard) => !protectedSellerId || c.seller_id === protectedSellerId;
	const feat = (c: HomeCard) => (allowFeat(c) && isHomeFeat(c, today, settings.home_feature_days) ? 1 : 0);

	const live = visible
		.filter((c) => c.status === 'LIVE' && inSel(c) && inCat(c))
		.sort((a, b) => feat(b) - feat(a) || b.sold_qty - a.sold_qty);
	const soon = visible
		.filter((c) => c.status === 'SCHEDULE_CONFIRMED' && inSel(c) && inCat(c))
		.sort((a, b) => feat(b) - feat(a) || (a.start_date ?? '').localeCompare(b.start_date ?? ''));
	const allLiveCodes = visible.filter((c) => c.status === 'LIVE').map((c) => c.code);
	const catCounts = Object.fromEntries(
		CATS.map((k) => [k, visible.filter((c) => (c.status === 'LIVE' || c.status === 'SCHEDULE_CONFIRMED') && (k === '전체' || c.product.category === k)).length])
	) as Record<string, number>;
	const rank = [...visible].sort((a, b) => b.sold_qty - a.sold_qty).slice(0, 5);
	const mxq = rank.length ? Math.max(1, rank[0].sold_qty) : 1;

	return {
		cat,
		sellerCode,
		sel,
		live: live.map((c) => ({ c, allowFeat: allowFeat(c) })),
		soon: soon.map((c) => ({ c, allowFeat: allowFeat(c) })),
		allLiveCodes,
		catCounts,
		rank,
		mxq,
		pubSellers,
		stats,
		link: L ? { sellerName: L.sellerName } : null,
		settings,
		today,
		name: parentData.user?.name ?? null
	};
};
