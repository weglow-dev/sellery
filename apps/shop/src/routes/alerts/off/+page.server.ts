import type { PageServerLoad } from './$types';
import { unsubscribeCampaignAlert } from '$lib/server/db';

/**
 * `/alerts/off?t=<토큰>` — 오픈 알림 메일 하단의 **1클릭 수신거부** 착지점 (0043).
 *
 * 로그인을 요구하지 않는다 — 메일을 받은 사람이 곧 본인이고, 토큰은 추측 불가한 uuid 다
 * (`campaign_alerts.unsub_token` · 유니크). 로그인을 요구하면 메일에서 끊기 어려워져 수신거부의 의미가 없다.
 *
 * 토큰이 없거나 틀려도 **404 를 내지 않는다** — 수신거부는 실패해도 고객을 막는 화면이 되어선 안 되고,
 * 존재 여부를 알려주면 토큰을 훑어볼 단서가 된다. 어느 쪽이든 같은 "처리됐어요" 화면을 보여준다.
 * GET 이지만 부수효과가 있다 — 메일 클라이언트의 링크 프리페치로도 수신거부가 될 수 있고,
 * 그건 "덜 받는" 방향이라 안전하다(멱등 · `unsubscribed_at` 이 이미 있으면 그대로).
 */
export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const token = (event.url.searchParams.get('t') ?? '').trim();
	const r = await unsubscribeCampaignAlert(token);
	return {
		// 토큰이 틀렸는지 알려주지 않는다(열거 방지) — 신청이 없었던 것과 이미 끊은 것을 구분하지 않는다
		ok: r.ok,
		campaignCode: r.ok ? r.campaignCode : null
	};
};
