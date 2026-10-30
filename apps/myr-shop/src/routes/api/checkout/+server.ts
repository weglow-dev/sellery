import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { generateOrderId, GUEST_CHECKOUT_COOKIE, GUEST_CHECKOUT_COOKIE_MAX_AGE, parseCheckoutBody, parseCreateResult } from '$lib/checkout-rules';
import { displayName } from '$lib/auth';
import { admin, hasAdmin } from '$lib/server/admin';
import { apiError, rejectCrossSite } from '$lib/server/checkout-sync';
import { createGuestCustomer, ensureCustomer } from '$lib/server/customers';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * POST /api/checkout — 결제 세션 생성 (apps/shop api/checkout 의 MYR 판 · docs/myr.md §6.2 · 0058 myr_app_create_checkout).
 * 입력 { lines:[{ code, qty, optionIndex? }], shipping:{ recipient, phone, address1, address2?, postcode?, memo? }, guest?:{ name, phone, email?, consent:true }, saveAddress? }
 *   ① 같은 오리진·JSON 만(403) · 본문 형식(400)
 *   ② 로그인 또는 비회원(미로그인이면 guest 필수 — 없으면 401 · IP 레이트리밋 30분 20건)
 *   ③ customers 행 — 회원 ensureCustomer · 비회원 app_guest_customer_upsert(체크아웃 1건 = 행 1개)
 *   ④ myr_app_create_checkout — 줄마다 listed·옵션·단가(서버 값)·잔여(소프트 예약) 검증 · 배송비 · supersede · 세션+줄 insert.
 *      한 줄이라도 미달이면 400 LINES_REJECTED { items:[{code, reason, left}] } — 화면이 그 줄만 표시
 *   ⑤ 비회원: HttpOnly 쿠키 myr_gck = 세션 id(45분) — confirm 이 소유 확인에 쓴다. 회원 saveAddress 면 customers.address 갱신(best-effort)
 * 출력 { ok:true, orderId(=toss_order_id), amount, itemsAmount, shippingFee, orderName, customerKey, phone, email }
 */
const MAX_PER_30M = 20;

export const POST: RequestHandler = async (event) => {
	const { request, locals, cookies } = event;
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const parsed = parseCheckoutBody(await request.json().catch(() => null));
	if (!parsed.ok) return apiError(400, 'BAD_REQUEST', parsed.message);
	const { lines, shipping, guest, saveAddress } = parsed.body;

	const { user } = await locals.safeGetSession();
	if (!user && !guest) return apiError(401, 'UNAUTHORIZED');
	if (!user && !rateLimit(`checkout:ip:${event.getClientAddress()}`, MAX_PER_30M)) return apiError(429, 'TOO_MANY_REQUESTS');
	if (!hasAdmin()) {
		console.error('[checkout] SUPABASE_SERVICE_ROLE_KEY 없음');
		return apiError(503, 'NO_SERVICE_KEY');
	}
	const db = admin();

	if (user) {
		const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
		const { count } = await db.from('myr_checkouts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
		if ((count ?? 0) >= MAX_PER_30M) return apiError(429, 'TOO_MANY_REQUESTS');
	}

	let customerId: string;
	try {
		customerId = user ? (await ensureCustomer(user)).id : await createGuestCustomer(guest!);
	} catch (e) {
		console.error('[checkout] customer failed:', e instanceof Error ? e.message : e);
		return apiError(500, 'DB_ERROR', '고객 정보를 확인하지 못했어요 — 잠시 후 다시 시도해주세요');
	}

	const prevGuest = user ? null : (cookies.get(GUEST_CHECKOUT_COOKIE) ?? null);
	const buyer = user ? { name: displayName(user), phone: shipping.phone, email: user.email ?? null } : guest!;
	const tossOrderId = generateOrderId();
	const { data, error } = await db.rpc('myr_app_create_checkout', {
		p_user_id: user?.id ?? null,
		p_customer_id: customerId,
		p_buyer: buyer,
		p_shipping: shipping,
		p_lines: lines,
		p_toss_order_id: tossOrderId,
		p_prev_checkout_id: prevGuest && /^[0-9a-f-]{36}$/.test(prevGuest) ? prevGuest : null
	});
	if (error) {
		console.error('[checkout] myr_app_create_checkout failed:', error.message);
		return apiError(500, 'DB_ERROR', '결제 준비에 실패했어요 — 잠시 후 다시 시도해주세요');
	}
	const r = parseCreateResult(data);
	if (!r.ok) {
		if (r.code === 'BAD_RESULT') return apiError(500, 'DB_ERROR');
		return apiError(400, r.code, r.message, { items: r.items });
	}

	if (user && saveAddress) {
		void db
			.from('customers')
			.update({ address: shipping, phone: shipping.phone })
			.eq('id', customerId)
			.then(({ error: e }) => {
				if (e) console.error('[checkout] customers.address update failed:', e.message);
			});
	}
	if (!user)
		cookies.set(GUEST_CHECKOUT_COOKIE, r.checkout.id, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: GUEST_CHECKOUT_COOKIE_MAX_AGE });

	return json({
		ok: true,
		orderId: r.checkout.toss_order_id,
		amount: r.checkout.amount,
		itemsAmount: r.checkout.items_amount,
		shippingFee: r.checkout.shipping_fee,
		orderName: r.checkout.order_name,
		customerKey: user?.id ?? customerId,
		phone: buyer.phone,
		email: buyer.email
	});
};
