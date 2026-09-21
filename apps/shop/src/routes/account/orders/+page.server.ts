import type { PageServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';
import { fetchMyAccount, fetchMyOrders, fetchOrderSettings } from '$lib/server/db';

/**
 * /account/orders — 내 주문 (프로토타입 js/60-customer.js vCustOrders · ux-spec §3.6 · app-plan §6.1 · web account/orders/page.tsx 1:1).
 *   · 미로그인: 리다이렉트 대신 "카카오 로그인하면 …" 카드 (프로토타입·web 동일 — `{ user: null }`)
 *   · 로그인: service role 조인 fetchMyOrders(user.id) — SETTLED 캠페인 주문도 상품명이 비지 않는다
 *   · 계정 카드: 이름 · 이메일 · 카카오 계정 · {md(customers.created_at)} 가입 · [로그아웃]
 * 캐시 헤더는 account/+layout.server.ts. 환불 뒤 `invalidateAll()` 이 이 load 를 다시 돈다 (router.refresh 대체).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return { user: null, orders: [], settings: { clear_days: 0 } };

	const [orders, settings, account] = await Promise.all([fetchMyOrders(user.id), fetchOrderSettings(), fetchMyAccount(user.id)]);
	const name = displayName(user);
	return {
		user: { name, email: user.email ?? account?.email ?? '', joined: account?.created_at ?? user.created_at },
		orders,
		settings
	};
};
