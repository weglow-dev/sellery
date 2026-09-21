import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ENDED_STATUSES } from '@sellery/db/partner/sample-rules';
import { listSellerCampaigns, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/campaigns` — 내 캠페인 목록 3단계 (docs/inf-console-plan.md §6 `/campaigns` · 프로토타입 js/20-seller.js vSellerCamps · campRow. 캘린더는 다음). 3단계 짝(0016): INVITED 수락·거절 · TESTING 일정 제안·패스 · SCHEDULE_PROPOSED 확인 중.
 * 읽기: `listSellerCampaigns(seller.id)` — 본인 것만(최신순) + 상품·브랜드 요약 + 상태 칩. 진행 중 / 끝난 캠페인(`ENDED_STATUSES`) 두 묶음.
 * 행의 "다음 할 일" 한 줄은 프로토타입 vSellerHome `TODO_L` 원문 — 인플루언서 차례인 상태만.
 */
const NEXT_HINT: Record<string, string> = {
	INVITED: '브랜드 직접 제안 — 수락 · 거절',
	SAMPLE_SHIPPED: '샘플 수령 확인',
	TESTING: '테스트 후 일정 제안 · 패스',
	SAMPLE_APPROVED: '샘플 배송 대기 (브랜드 발송 중)',
	SAMPLE_PURCHASED: '샘플 구매 완료 · 브랜드 발송 대기',
	SAMPLE_REQUESTED: '브랜드 승인 대기 중',
	SCHEDULE_PROPOSED: '브랜드 일정 확인 중 — 다시 제안 가능'
};

export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/campaigns' });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const all = await listSellerCampaigns(seller.id);
	const rows = all.map((c) => ({
		code: c.code,
		status: c.status,
		chip: c.chip,
		hint: NEXT_HINT[c.status] ?? null,
		test_due: c.test_due,
		start_date: c.start_date,
		end_date: c.end_date,
		product: { name: c.product.name, emoji: c.product.emoji, thumb_url: c.product.thumb_url, commission_rate: c.product.commission_rate },
		brand: { name: c.brand.name },
		href: sellerPath(`/campaigns/${encodeURIComponent(c.code)}`),
		ended: (ENDED_STATUSES as readonly string[]).includes(c.status)
	}));

	return {
		active: rows.filter((c) => !c.ended),
		ended: rows.filter((c) => c.ended),
		productsPath: sellerPath('/products')
	};
};
