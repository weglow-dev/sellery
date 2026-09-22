import type { PageServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';
import { csStatusChip } from '@sellery/db/cs/cs-rules';
import { fetchMyAccount, fetchMyOrders, fetchOrderSettings, listCsForUser } from '$lib/server/db';

/**
 * /account/orders — 내 주문 (프로토타입 js/60-customer.js vCustOrders · ux-spec §3.6 · app-plan §6.1 · web account/orders/page.tsx 1:1).
 *   · 미로그인: 리다이렉트 대신 "카카오 로그인하면 …" 카드 (프로토타입·web 동일 — `{ user: null }`)
 *   · 로그인: service role 조인 fetchMyOrders(user.id) — SETTLED 캠페인 주문도 상품명이 비지 않는다
 *   · 계정 카드: 이름 · 이메일 · 카카오 계정 · {md(customers.created_at)} 가입 · [로그아웃]
 *   · 문의 내역(4단계 shop 짝 · 0018 `app_cs_list_for_user`): `listCsForUser(user.id)` — 회원으로 접수한 판매자 문의(최신순 ≤100) · 행마다 `/cs/<code>`. 주문 행의 [문의] 모달은 `/cs/new?campaign=&order=` 로 잇는다.
 * 캐시 헤더는 account/+layout.server.ts. 환불 뒤 `invalidateAll()` 이 이 load 를 다시 돈다 (router.refresh 대체).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return { user: null, orders: [], settings: { clear_days: 0 }, cs: [] };

	const [orders, settings, account, cs] = await Promise.all([fetchMyOrders(user.id), fetchOrderSettings(), fetchMyAccount(user.id), listCsForUser(user.id)]);
	const name = displayName(user);
	return {
		user: { name, email: user.email ?? account?.email ?? '', joined: account?.created_at ?? user.created_at },
		orders,
		settings,
		cs: cs.map((x) => ({
			code: x.code,
			status: x.status,
			chip: csStatusChip(x.status),
			type: x.type,
			order_code: x.order_code,
			last_preview: x.last_preview,
			last_message_at: x.last_message_at,
			brand_name: x.campaign.brand?.name ?? '브랜드',
			product: x.campaign.product,
			href: `/cs/${encodeURIComponent(x.code)}`
		}))
	};
};
