import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { storeUrl } from '@sellery/db/campaign';
import { addDays } from '@sellery/db/dates';
import { CLEAR_DAYS, TEST_DAYS } from '@sellery/core/constants';
import { SITE_URL } from '$lib/server/env';
import { getSellerCampaign, RATE_LIMIT_MESSAGE, rateLimit, receiveSample, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/campaigns/[code]` — 캠페인 상세(스테퍼 · 요약 · 스레드 · 액션) 3단계 (docs/inf-console-plan.md §6 `/campaigns/[code]` · 프로토타입 js/70-campaign.js vCampDetail · detActions seller 분기).
 * load: `getSellerCampaign(seller.id, code)` — **본인 것이 아니면 null → 404**(§7 3단계 (d), 소유자 불일치를 구분하지 않는다). 스레드는 campaign_events 시간순, 읽기 전용(채팅 입력은 다음 단계).
 * action receive: SAMPLE_SHIPPED → `receiveSample` RPC(TESTING · test_due 오늘+14 · 멱등) → 같은 페이지로 303 `?msg=received|already|not_shipped|err`.
 * 정산 미리보기 표(calc)는 5단계 매출·정산과 함께 — 여기서는 상태별 안내와 날짜만.
 */
export type CampaignMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MESSAGES: Record<string, CampaignMessage> = {
	requested: { tone: 'ok', text: '무상 샘플을 요청했어요 — 브랜드가 프로필을 검토한 뒤 승인하면 배송지로 샘플이 발송됩니다.' },
	received: { tone: 'ok', text: `샘플 수령을 확인했어요 — 테스트 기한 ${TEST_DAYS}일이 시작됩니다.` },
	already: { tone: 'info', text: '이미 수령 확인된 캠페인이에요.' },
	not_shipped: { tone: 'danger', text: '아직 발송 전이에요 — 브랜드가 발송하면 운송장이 표시됩니다.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE },
	err: { tone: 'danger', text: '처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요.' }
};

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireSeller(event, { next: `/campaigns/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const found = await getSellerCampaign(seller.id, code);
	if (!found) error(404, { message: '캠페인을 찾을 수 없습니다' });
	const { campaign: c, sample_shipping, events } = found;

	const storePath = storeUrl(seller.handle, c.code);
	return {
		seller: { name: seller.name, handle: seller.handle, platform: seller.platform },
		campaign: c,
		sample_shipping,
		events,
		msg: MESSAGES[event.url.searchParams.get('msg') ?? ''] ?? null,
		storeUrl: `${SITE_URL}${storePath}`,
		storeDisplay: `${SITE_URL.replace(/^https?:\/\//, '')}${storePath}`,
		settleDue: c.end_date ? addDays(c.end_date, CLEAR_DAYS) : null,
		clearDays: CLEAR_DAYS,
		testDays: TEST_DAYS,
		listPath: sellerPath('/campaigns'),
		productHref: c.product.code ? sellerPath(`/products/${encodeURIComponent(c.product.code)}`) : null
	};
};

export const actions: Actions = {
	receive: async (event) => {
		const code = event.params.code;
		const r = await requireSeller(event, { next: `/campaigns/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = sellerPath(`/campaigns/${encodeURIComponent(code)}`);
		if (!rateLimit(`receive:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const res = await receiveSample(r.ctx.seller.id, code);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '캠페인을 찾을 수 없습니다' });
			redirect(303, `${self}?msg=${res.code === 'NOT_SHIPPED' ? 'not_shipped' : 'err'}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'received'}`);
	}
};
