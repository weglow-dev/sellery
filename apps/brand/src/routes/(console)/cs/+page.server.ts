import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CS_STATUS_CHIPS, csStatusChip, isCsStatus, type CsStatus } from '@sellery/db/cs/cs-rules';
import { brandPath, listBrandCs, requireBrand } from '$lib/server/brand';

/**
 * `/cs` — 고객 문의함 4단계 (docs/brand-console-plan.md §5 `/brand/cs` · CLAUDE.md "고객 CS 는 관리자를 거치지 않고 브랜드로 바로" · 프로토타입 데모 demo-cs/+page.svelte).
 * 읽기: `listBrandCs(brand.id)` — OPEN → ANSWERED → CLOSED · 최근 메시지순(≤500). `?status=OPEN|ANSWERED|CLOSED` 는 화면 필터(칩 카운트는 전체에서).
 * 행: 유형 · 고객명 · 주문번호(캠페인 주문으로 해석되면 "매칭") · 캠페인/상품/인플루언서 · 마지막 메시지 미리보기 · 시간 → `/cs/[code]`(답변 · 종료).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/cs' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const sRaw = event.url.searchParams.get('status') ?? '';
	const status: CsStatus | null = isCsStatus(sRaw) ? sRaw : null;
	const all = await listBrandCs(brand.id);
	const self = brandPath('/cs');
	const count = (st: CsStatus) => all.filter((x) => x.status === st).length;

	return {
		status,
		chips: [
			{ key: '', label: '전체', n: all.length, href: self },
			...(Object.keys(CS_STATUS_CHIPS) as CsStatus[]).map((k) => ({ key: k, label: CS_STATUS_CHIPS[k].label, n: count(k), href: `${self}?status=${k}` }))
		],
		open: count('OPEN'),
		rows: (status ? all.filter((x) => x.status === status) : all).map((x) => ({
			code: x.code,
			status: x.status,
			chip: csStatusChip(x.status),
			type: x.type,
			buyer_name: x.buyer_name,
			is_member: x.is_member,
			order_code: x.order_code,
			order_matched: x.order !== null,
			last_preview: x.last_preview,
			last_message_at: x.last_message_at,
			message_count: x.message_count,
			campaign: { code: x.campaign.code, product: x.campaign.product, seller: x.campaign.seller },
			href: brandPath(`/cs/${encodeURIComponent(x.code)}`)
		})),
		ordersPath: brandPath('/orders')
	};
};
