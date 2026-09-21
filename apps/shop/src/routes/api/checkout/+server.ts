import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Json } from '@sellery/db/database.types';
import type { Shipping } from '@sellery/db/types';
import { displayName } from '@sellery/db/auth';
import { LINKCTX_COOKIE, LINK_CODE_RE } from '@sellery/db/linkctx';
import { cleanText, normalizePhone } from '@sellery/db/text';
import { generateOrderId } from '@sellery/payments/money';
import { createAdminClient, ensureCustomer, fetchCampaignCard, type Admin } from '$lib/server/db';
import { apiError, gateIsLive, rejectCrossSite, softStockLeft, type CampaignGate } from '$lib/server/payments';

/**
 * POST /api/checkout — 결제 세션 생성 (app-plan §6.2 · §7.1 · web api/checkout/route.ts 1:1).
 *
 * 입력 { code, optionIndex, qty, recipient, phone, postcode, address1, address2?, memo?, saveAddress? }
 * 순서(§6.2 ①~⑦):
 *   ① 401 미로그인
 *   ② campaign_card(code): LIVE 이고 start_date ≤ today ≤ end_date 아니면 400 NOT_LIVE · qty 정수 1..10 · optionIndex 범위
 *      · 소프트 예약: left = qty − sold_qty − app_checkout_reserved(campaign_id) 가 요청 qty 미만이면 400 SOLD_OUT
 *   ③ 단가 = options[optionIndex].price (서버 값 — 클라이언트 amount 는 받지 않는다), amount ≥ 100
 *   ④ 배송지 검증 + cleanText · phone 은 normalizePhone(숫자 8~15자리) 아니면 400 BAD_REQUEST
 *   ⑤ ensureCustomer → customers.id
 *   ⑥ 같은 user_id 의 기존 PENDING 세션을 EXPIRED(SUPERSEDED) 로(§5.1, 진행 중 세션 1건) → checkout_sessions insert
 *      — supersede 는 모든 검증·ensureCustomer 를 통과한 뒤 insert 직전에만 한다(새 시도가 SOLD_OUT/500 으로 거절돼도 다른 탭에서
 *        진행 중이던 이전 세션을 죽이지 않는다). 소프트 예약 계산에서는 본인의 이 캠페인 PENDING qty 를 빼서 잔여를 본다.
 *   ⑦ saveAddress 면 customers.address/phone 갱신(best-effort)
 * 출력 { ok:true, sessionId, orderId(=toss_order_id), amount, orderName, customerKey(=user.id), phone(정규화값), email }
 * 실패 { ok:false, code, message } (§6.3). 최근 30분 세션 20건 초과 → 429. 다른 오리진·비JSON 본문 → 403 BAD_ORIGIN.
 */
const CAMPAIGN_CODE_RE = /^[a-z0-9_-]{1,32}$/;
const MAX_SESSIONS_PER_30M = 20;

/** 본인의 미만료 PENDING 세션 qty 합(이 캠페인) — 곧 SUPERSEDED 될 예약분이라 소프트 재고에서 되돌린다 */
async function ownPendingQty(admin: Admin, userId: string, campaignId: string): Promise<number> {
	const { data, error } = await admin
		.from('checkout_sessions')
		.select('qty')
		.eq('user_id', userId)
		.eq('campaign_id', campaignId)
		.eq('status', 'PENDING')
		.gt('expires_at', new Date().toISOString());
	if (error) {
		console.error('[checkout] own pending read failed:', error.message);
		return 0;
	}
	return (data ?? []).reduce((sum, r) => sum + (r.qty ?? 0), 0);
}

type Body = {
	code?: unknown;
	optionIndex?: unknown;
	qty?: unknown;
	recipient?: unknown;
	phone?: unknown;
	postcode?: unknown;
	address1?: unknown;
	address2?: unknown;
	memo?: unknown;
	saveAddress?: unknown;
};

function optString(v: unknown, max: number): string {
	return typeof v === 'string' ? cleanText(v).slice(0, max) : '';
}

export const POST: RequestHandler = async (event) => {
	const { request, locals, cookies } = event;
	// ⓪ 같은 오리진·JSON 본문만 (CSRF — Supabase 쿠키 SameSite 에만 기대지 않는다)
	const cross = rejectCrossSite(request);
	if (cross) return cross;

	// ① 로그인 필수 (app-plan §0 결정 7)
	const { user } = await locals.safeGetSession();
	if (!user) return apiError(401, 'UNAUTHORIZED');

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return apiError(400, 'BAD_REQUEST', '요청 본문이 올바르지 않습니다');
	}

	// ② 입력 형식
	const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
	if (!CAMPAIGN_CODE_RE.test(code)) return apiError(400, 'BAD_REQUEST', '판매 코드가 올바르지 않습니다');
	const optionIndex = body.optionIndex;
	if (!Number.isInteger(optionIndex) || (optionIndex as number) < 0) {
		return apiError(400, 'BAD_REQUEST', '옵션을 선택해주세요');
	}
	const qty = body.qty;
	if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 10) {
		return apiError(400, 'BAD_REQUEST', '수량은 1~10개 사이여야 합니다');
	}

	// ④ 배송지 검증 (저장 시점에 cleanText — 이모지가 발주 CSV·택배사 시스템으로 흘러가지 않게)
	const recipient = optString(body.recipient, 50);
	if (!recipient) return apiError(400, 'BAD_REQUEST', '받는 분 이름을 입력해주세요');
	const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
	if (!phone) return apiError(400, 'BAD_REQUEST', '연락처는 숫자 8~15자리로 입력해주세요');
	const postcode = typeof body.postcode === 'string' ? body.postcode.replace(/\D/g, '') : '';
	if (!/^\d{5}$/.test(postcode)) return apiError(400, 'BAD_REQUEST', '우편번호 5자리를 입력해주세요');
	const address1 = optString(body.address1, 200);
	if (!address1) return apiError(400, 'BAD_REQUEST', '주소를 입력해주세요');
	const address2 = optString(body.address2, 200);
	const memo = optString(body.memo, 100);
	const saveAddress = body.saveAddress === true;

	const shipping: Shipping = { recipient, phone, postcode, address1 };
	if (address2) shipping.address2 = address2;
	if (memo) shipping.memo = memo;

	// ② 캠페인 검증 — campaign_card(code) 가 단일 소스 (옵션 가격·today 포함)
	const card = await fetchCampaignCard(event, code);
	if (!card) return apiError(404, 'NOT_FOUND', '판매 페이지를 찾을 수 없습니다');

	const gate: CampaignGate = {
		code: card.campaign.code,
		status: card.campaign.status,
		start_date: card.campaign.start_date,
		end_date: card.campaign.end_date,
		qty: card.campaign.qty,
		sold_qty: card.campaign.sold_qty,
		today: card.campaign.today
	};
	if (!gateIsLive(gate)) return apiError(400, 'NOT_LIVE', '현재 판매 중이 아닙니다');

	const options = card.product.options;
	const oi = optionIndex as number;
	const q = qty as number;
	if (oi >= options.length) return apiError(400, 'BAD_REQUEST', '옵션을 선택해주세요');
	const opt = options[oi];

	// ③ 단가·금액 (서버 값)
	const unitPrice = opt.price;
	if (!Number.isInteger(unitPrice) || unitPrice < 0) return apiError(400, 'BAD_REQUEST', '옵션 가격이 올바르지 않습니다');
	const amount = unitPrice * q;
	if (amount < 100) return apiError(400, 'BAD_REQUEST', '결제 금액은 100원 이상이어야 합니다');

	const admin = createAdminClient();

	// 사용자당 미결제 세션 상한 (§5.1): 최근 30분 20건 초과 → 429
	const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
	const { count: recentCount } = await admin
		.from('checkout_sessions')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.gte('created_at', since);
	if ((recentCount ?? 0) >= MAX_SESSIONS_PER_30M) {
		return apiError(429, 'TOO_MANY_REQUESTS', '결제 시도가 너무 많아요 — 잠시 후 다시 시도해주세요');
	}

	// ② 소프트 예약 — 잔여가 없으면 결제창을 열지 않는다 (하드 예약은 하지 않는다: 최종 방어선은 app_confirm_checkout).
	//    본인의 이 캠페인 PENDING 예약분은 ⑥-a 에서 SUPERSEDED 될 것이므로 되돌려 계산한다.
	const own = await ownPendingQty(admin, user.id, card.campaign.id);
	const left = await softStockLeft(admin, card.campaign.id, gate, own);
	if (left < q) {
		return apiError(400, 'SOLD_OUT', `남은 수량이 부족합니다 (잔여 ${Math.max(0, left)}개)`);
	}

	// ⑤ customers 행 보장 (필수 — customer_id 를 세션에 저장)
	let customerId: string;
	try {
		const customer = await ensureCustomer(admin, user);
		customerId = customer.id;
	} catch (e) {
		console.error('[checkout] ensureCustomer failed:', e instanceof Error ? e.message : e);
		return apiError(500, 'DB_ERROR', '고객 정보를 확인하지 못했어요 — 잠시 후 다시 시도해주세요');
	}

	// 유입 쿠키 (분석용 — 귀속 근거 아님, §8). 형식 통과값만.
	const rawLink = cookies.get(LINKCTX_COOKIE) ?? '';
	const linkCode = LINK_CODE_RE.test(rawLink) ? rawLink : null;

	// ⑥-a 같은 사용자의 기존 PENDING 세션을 SUPERSEDED 로 (진행 중 세션 1건). CONFIRMING 은 건드리지 않는다.
	//     모든 검증·ensureCustomer 를 통과한 뒤 insert 직전에만 — 새 시도가 거절될 때 이전 세션(다른 탭의 결제창)을 죽이지 않는다.
	{
		const { error } = await admin
			.from('checkout_sessions')
			.update({ status: 'EXPIRED', fail_code: 'SUPERSEDED', fail_message: '새 결제 시도로 대체되었습니다' })
			.eq('user_id', user.id)
			.eq('status', 'PENDING');
		if (error) console.error('[checkout] supersede failed:', error.message);
	}

	// ⑥-b 세션 insert (PENDING, expires_at 은 DB 기본값 now()+30m)
	const tossOrderId = generateOrderId();
	const orderName = `${card.product.name} · ${opt.n} × ${q}`.slice(0, 100);
	const { data: session, error: insertError } = await admin
		.from('checkout_sessions')
		.insert({
			toss_order_id: tossOrderId,
			user_id: user.id,
			customer_id: customerId,
			campaign_id: card.campaign.id,
			option_index: oi,
			option_name: opt.n,
			qty: q,
			unit_price: unitPrice,
			order_name: orderName,
			buyer_name: displayName(user),
			buyer_phone: phone,
			buyer_email: user.email ?? null,
			shipping: shipping as Json,
			link_code: linkCode
		})
		.select('id, toss_order_id, amount, order_name')
		.single();
	if (insertError || !session) {
		console.error('[checkout] session insert failed:', insertError?.message);
		return apiError(500, 'DB_ERROR', '결제 준비에 실패했어요 — 잠시 후 다시 시도해주세요');
	}

	// ⑦ 기본 배송지 저장 (best-effort)
	if (saveAddress) {
		void admin
			.from('customers')
			.update({ address: shipping as Json, phone })
			.eq('id', customerId)
			.then(({ error }) => {
				if (error) console.error('[checkout] customers.address update failed:', error.message);
			});
	}

	return json({
		ok: true,
		sessionId: session.id,
		orderId: session.toss_order_id,
		amount: session.amount ?? amount,
		orderName: session.order_name,
		customerKey: user.id,
		phone,
		email: user.email ?? null
	});
};
