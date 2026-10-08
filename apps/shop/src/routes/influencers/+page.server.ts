import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { isCat } from '@sellery/db/campaign';
import { filterSellers, isSellerPlatform, sellerCampaignStats, sellerCounts } from '@sellery/db/sellers';
import { absoluteUrl, fetchHomeCampaigns, fetchPublicSellerProfiles, followSeller, followedSellerIds, rateLimit, readLinkCtx, unfollowSeller } from '$lib/server/db';

/**
 * 고객 `/influencers` — 셀러리 인증 인플루언서 목록 (프로토타입 vCustInfluencers · docs/app-plan.md §6.1).
 *   입력: ?platform= (instagram|youtube|naver|tiktok) · ?cat= (CATS) · 쿠키 slry_linkctx (readLinkCtx)
 *   데이터: anon fetchPublicSellerProfiles(sellers 공개 컬럼 · 인증된 메인 채널 inner 조인 · hidden 은 RLS) + fetchHomeCampaigns(홈과 같은 조인) 로 인플루언서별 진행 중·오픈 예정·완료 건수와 LIVE 링크.
 *   링크 보호(app-plan §8): 목록은 전원 노출(홈의 인플루언서 칩과 동일), 건수·LIVE 링크는 custVisible 통과분만 + 안내문. 칩 건수는 전체 기준.
 *   PUBLIC_SUPABASE_* 가 비면 빈 목록으로 렌더(빈 상태 문구).
 *   **팔로우(0045)**: 회원이면 팔로우 여부를 함께 넘긴다 — 토글은 아래 폼 액션이고, 효과는 홈 정렬 우대뿐이다(메일 없음).
 *     해제도 이 화면에서 한다(`/account` 에 팔로우 목록 화면이 없다 — 같은 버튼이 토글).
 */
export const load: PageServerLoad = async (event) => {
	const platformParam = event.url.searchParams.get('platform');
	const catParam = event.url.searchParams.get('cat');
	const platform = isSellerPlatform(platformParam) ? platformParam : null;
	const cat = isCat(catParam) && catParam !== '전체' ? catParam : null;

	const [all, cards, L, parentData, followed] = await Promise.all([
		fetchPublicSellerProfiles(event),
		fetchHomeCampaigns(event),
		readLinkCtx(event).catch(() => null),
		event.parent(),
		event.locals.safeGetSession().then(({ user }) => followedSellerIds(user?.id ?? null))
	]);

	const list = filterSellers(all, { platform, cat }).map((s) => ({
		s,
		stats: sellerCampaignStats(cards, s.id, L),
		following: followed.has(s.id)
	}));

	return {
		platform,
		cat,
		total: all.length,
		counts: sellerCounts(all),
		list,
		link: L ? { sellerName: L.sellerName } : null,
		canonical: absoluteUrl('/influencers'),
		signedIn: parentData.user !== null,
		followMsg: event.url.searchParams.get('follow')
	};
};

/** 폼 액션 쿼리(`?/follow`)를 뺀 주소 — 로그인 복귀·결과 리다이렉트가 필터만 유지하게 */
function cleanQuery(event: RequestEvent): URLSearchParams {
	const q = new URLSearchParams();
	for (const [k, v] of event.url.searchParams) {
		// SvelteKit 은 named action 을 `?/follow` 처럼 키로 싣는다 — 복귀 주소에 남기지 않는다
		if (k.startsWith('/') || k === 'follow') continue;
		q.set(k, v);
	}
	return q;
}

/** 결과를 주소의 `?follow=` 로 옮긴다 — 필터(`?platform=` `?cat=`)는 유지한다 */
function done(event: RequestEvent, key: string): never {
	const q = cleanQuery(event);
	q.set('follow', key);
	redirect(303, `${event.url.pathname}?${q.toString()}`);
}

/** 팔로우·해제 공용 — 둘 다 `code` 하나만 받는다 */
async function toggle(event: RequestEvent, on: boolean): Promise<never> {
	const { user } = await event.locals.safeGetSession();
	if (!user) {
		const q = cleanQuery(event).toString();
		redirect(303, `/login?next=${encodeURIComponent(`${event.url.pathname}${q ? `?${q}` : ''}`)}`);
	}
	const form = await event.request.formData();
	const code = String(form.get('code') ?? '').trim();
	if (!code) done(event, 'err_NOT_FOUND');
	if (!rateLimit(`follow:${user.id}`, 60)) done(event, 'err_DB_ERROR');
	const r = on ? await followSeller(code, user.id) : await unfollowSeller(code, user.id);
	if (!r.ok) done(event, `err_${r.code}`);
	done(event, on ? (r.already ? 'on_already' : 'on') : r.already ? 'off_already' : 'off');
}

export const actions: Actions = {
	follow: (event) => toggle(event, true),
	unfollow: (event) => toggle(event, false)
};
