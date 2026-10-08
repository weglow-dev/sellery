import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { canonicalStoreUrl, isEnded, normalizeHandle, ogImageSrc } from '@sellery/db/campaign';
import type { AlertState } from '@sellery/db/campaign-alerts';
import { absoluteUrl, cancelCampaignAlert, campaignAlertState, fetchCampaignCard, fetchSellerOtherCampaigns, rateLimit, subscribeCampaignAlert } from '$lib/server/db';

/**
 * 판매 링크 페이지 `/s/[handle]/[code]` 데이터 — web s/[handle]/[code]/page.tsx 1:1 (프로토타입 vStore · ux-spec §3.1 · app-plan §6.1 · docs/monorepo-migration.md §4.1).
 *   · anon campaign_card(code) → null 이면 404 (+error.svelte "판매 페이지를 찾을 수 없습니다")
 *   · URL 핸들이 정식 핸들(normalizeHandle(seller.handle) — '@' 없음)과 다르면 308 canonicalStoreUrl (정식 URL 재요청은 raw 세그먼트 === 정식 핸들이라 200 — 무한 리다이렉트 없음)
 *   · 쿠키·재고를 읽으므로 캐시하지 않는다(SSR 기본). 링크 쿠키는 hooks.server.ts 가 이 경로에서 세팅한다.
 *   · 메타(generateMetadata 대체)는 데이터로 넘기고 +page.svelte 의 <svelte:head> 가 렌더한다 (§3.4).
 *   · **오픈 알림(0043)**: 오픈 전(`SCHEDULE_CONFIRMED`)이면 알림 신청 상태를 함께 넘긴다. 이메일이 등록된
 *     회원만 신청할 수 있어 비로그인·이메일 없는 계정은 버튼 대신 안내가 뜬다(`alertButtonView`).
 */
export const load: PageServerLoad = async (event) => {
	const { handle, code } = event.params;
	const card = await fetchCampaignCard(event, code);
	if (!card) error(404, { message: '판매 페이지를 찾을 수 없습니다' });
	if (handle !== normalizeHandle(card.seller.handle)) redirect(308, canonicalStoreUrl(card));

	const [others, parentData] = await Promise.all([fetchSellerOtherCampaigns(event, card.seller.id, card.campaign.id), event.parent()]);

	// 오픈 전에만 조회한다 — LIVE·종료 캠페인에서는 버튼이 없으므로 쿼리를 아낀다.
	// 레이아웃이 넘기는 user 는 표시명뿐이라(`+layout.server.ts`) id 는 세션에서 다시 읽는다.
	let alert: AlertState = { subscribed: false, canSubscribe: false, hasEmail: false };
	if (card.campaign.status === 'SCHEDULE_CONFIRMED') {
		const { user } = await event.locals.safeGetSession();
		alert = await campaignAlertState(card.campaign.code, user?.id ?? null);
	}

	const ended = isEnded(card.campaign, card.campaign.today);
	const og = ogImageSrc(card.product.thumb_url);
	const description = [card.product.description, card.brand.name, `${card.seller.name}님의 셀러리 인증 판매`].filter(Boolean).join(' · ');
	const canonical = absoluteUrl(canonicalStoreUrl(card));

	return {
		card,
		others,
		signedIn: parentData.user !== null,
		alert,
		alertMsg: event.url.searchParams.get('alert'),
		meta: {
			title: `${card.product.name} · ${card.seller.name}`,
			description,
			canonical,
			ogImage: og ? absoluteUrl(og) : null,
			noindex: ended
		}
	};
};

/** 결과를 주소의 `?alert=` 로 옮긴다 — 새로고침에 같은 동작이 다시 실행되지 않게(POST → 303) */
function done(event: RequestEvent, key: string): never {
	redirect(303, `${event.url.pathname}?alert=${encodeURIComponent(key)}`);
}

export const actions: Actions = {
	/** 오픈 알림 신청 — 이메일이 등록된 회원만(0043). 비로그인은 로그인 화면으로 보낸다(돌아올 주소 유지) */
	alertOn: async (event) => {
		const { user } = await event.locals.safeGetSession();
		if (!user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		if (!rateLimit(`alert:${user.id}`, 20)) done(event, 'err_DB_ERROR');
		const r = await subscribeCampaignAlert(event.params.code, user.id);
		done(event, r.ok ? (r.already ? 'on_already' : 'on') : `err_${r.code}`);
	},

	/** 신청 취소 — 같은 화면의 토글 */
	alertOff: async (event) => {
		const { user } = await event.locals.safeGetSession();
		if (!user) redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		if (!rateLimit(`alert:${user.id}`, 20)) done(event, 'err_DB_ERROR');
		const r = await cancelCampaignAlert(event.params.code, user.id);
		done(event, r.ok ? (r.already ? 'off_already' : 'off') : `err_${r.code}`);
	}
};
