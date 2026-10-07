import type { PageServerLoad } from './$types';
import { canonicalStoreUrl } from '@sellery/db/campaign';
import { GUEST_CHECKOUT_COOKIE } from '@sellery/db/guest-order';
import {
	checkoutHref,
	failPageReason,
	failSessionCode,
	isGuestParam,
	ownsCheckoutSession,
	parseCheckoutParams,
	TOSS_KEY_RE
} from '@sellery/payments/checkout-rules';
import { createAdminClient, fetchCampaignCard } from '$lib/server/db';
import { failSession } from '$lib/server/payments';

/**
 * /checkout/fail?code&message&orderId&c&o&q — 토스 failUrl 랜딩 (app-plan §6.1 · ux-spec §3.5 · web checkout/fail/page.tsx 1:1).
 * 위젯 단계 실패(고객 취소 · 카드사 거절)만 온다. PAY_PROCESS_CANCELED → "결제를 취소했어요…", 그 외 토스 message + 코드.
 * "다시 시도" → /checkout?c&o&q[&g=1 비회원 모드 유지] (failUrl 에 실어 보낸 값) · "판매 페이지로" → 정식 URL (campaign_card 로 확인, 없으면 홈)
 *
 * **세션 종결(0042)**: 여기서 PENDING 세션을 FAILED 로 끝낸다. 끝내지 않으면 `expires_at`(기본 30분)까지
 * 소프트 예약(`app_checkout_reserved` — PENDING/CONFIRMING 미만료 qty 합)에 남아 다른 고객에게 품절로 보인다.
 * 결제창을 열었다 닫은 수만큼 잔여가 줄고 아무도 결제하지 않았는데 "남은 수량이 부족합니다" 가 뜬다.
 *   · 대상은 **PENDING 만**이다. payment_key 가 붙은 CONFIRMING 은 돈이 잡혔을 수 있어 토스 재조회로만 종결한다(§7.5 reconcile).
 *   · 소유를 `ownsCheckoutSession` 으로 확인한다 — `orderId` 는 공개 URL 값이라 이 판정이 없으면
 *     주문번호만 알면 남의 결제 세션을 종결할 수 있다.
 *   · 실패해도 화면은 그대로 보여준다(로그만) — 못 끝내면 만료가 뒤처리한다.
 *
 * 공개 URL 파라미터 반사 — code/message 는 failPageReason 이 형식·길이·스푸핑 패턴을 거르고, orderId 는 형식 통과값만 표시.
 */
export const load: PageServerLoad = async (event) => {
	const sp = Object.fromEntries(event.url.searchParams) as Record<string, string | undefined>;
	const code = (sp.code ?? '').slice(0, 80);
	const reason = failPageReason(code, sp.message);
	const orderIdRaw = sp.orderId ?? '';
	const orderId = TOSS_KEY_RE.test(orderIdRaw) ? orderIdRaw : '';

	if (orderId) await endPendingSession(event, orderId, code);

	const params = parseCheckoutParams(sp);
	const card = params ? await fetchCampaignCard(event, params.code) : null;
	const storeHref = card ? canonicalStoreUrl(card) : '/';
	const retryHref = params && card ? checkoutHref(params.code, params.optionIndex, params.qty, isGuestParam(sp)) : null;
	return { reason, orderId, storeHref, retryHref };
};

/** PENDING 세션을 FAILED 로 — 소유자 본인의 요청일 때만. 절대 throw 하지 않는다(화면이 먼저다). */
async function endPendingSession(event: Parameters<PageServerLoad>[0], tossOrderId: string, tossCode: string): Promise<void> {
	try {
		const admin = createAdminClient();
		const { data: session, error } = await admin
			.from('checkout_sessions')
			.select('id, user_id, status')
			.eq('toss_order_id', tossOrderId)
			.maybeSingle();
		if (error) {
			console.error('[checkout/fail] session lookup failed:', error.message);
			return;
		}
		if (!session || session.status !== 'PENDING') return;

		const { user } = await event.locals.safeGetSession();
		const owns = ownsCheckoutSession(session, {
			userId: user?.id ?? null,
			guestSessionId: event.cookies.get(GUEST_CHECKOUT_COOKIE) ?? null
		});
		if (!owns) return;

		// from: PENDING 만 — 그 사이 confirm 이 선점(CONFIRMING)했다면 건드리지 않는다
		await failSession(admin, session.id, { code: failSessionCode(tossCode) }, ['PENDING']);
	} catch (e) {
		console.error('[checkout/fail] session end threw:', e instanceof Error ? e.message : e);
	}
}
