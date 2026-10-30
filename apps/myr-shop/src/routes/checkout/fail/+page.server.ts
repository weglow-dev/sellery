import type { PageServerLoad } from './$types';
import { failPageReason, failSessionCode, GUEST_CHECKOUT_COOKIE, ownsCheckout, TOSS_KEY_RE } from '$lib/checkout-rules';
import { admin, hasAdmin } from '$lib/server/admin';
import { failCheckout } from '$lib/server/checkout-sync';

/**
 * /checkout/fail?code&message&orderId — 토스 failUrl 랜딩(위젯 단계 실패 · 고객 취소). apps/shop checkout/fail 의 MYR 판.
 * 여기서 **본인의 PENDING 세션을 FAILED 로 끝낸다** — 안 끝내면 30분 동안 소프트 예약에 남아 다른 고객에게 품절로 보인다. CONFIRMING(payment_key 있음)은 건드리지 않는다.
 * 공개 URL 파라미터는 failPageReason 이 형식·길이·스푸핑을 거른다.
 */
export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const code = (url.searchParams.get('code') ?? '').slice(0, 80);
	const reason = failPageReason(code, url.searchParams.get('message'));
	const orderIdRaw = url.searchParams.get('orderId') ?? '';
	const orderId = TOSS_KEY_RE.test(orderIdRaw) ? orderIdRaw : '';
	if (orderId && hasAdmin()) {
		try {
			const db = admin();
			const { data } = await db.from('myr_checkouts').select('id, user_id, status').eq('toss_order_id', orderId).maybeSingle();
			const s = data as { id: string; user_id: string | null; status: string } | null;
			if (s && s.status === 'PENDING') {
				const { user } = await locals.safeGetSession();
				if (ownsCheckout(s, { userId: user?.id ?? null, guestCheckoutId: cookies.get(GUEST_CHECKOUT_COOKIE) ?? null })) {
					await failCheckout(db, s.id, { code: failSessionCode(code) }, ['PENDING']);
				}
			}
		} catch (e) {
			console.error('[checkout/fail] end session threw:', e instanceof Error ? e.message : e);
		}
	}
	return { reason, orderId };
};
