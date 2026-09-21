import type { PageServerLoad } from './$types';
import { canonicalStoreUrl } from '@sellery/db/campaign';
import { checkoutHref, failPageReason, parseCheckoutParams, TOSS_KEY_RE } from '@sellery/payments/checkout-rules';
import { fetchCampaignCard } from '$lib/server/db';

/**
 * /checkout/fail?code&message&orderId&c&o&q — 토스 failUrl 랜딩 (app-plan §6.1 · ux-spec §3.5 · web checkout/fail/page.tsx 1:1).
 * 위젯 단계 실패(고객 취소 · 카드사 거절)만 온다. PAY_PROCESS_CANCELED → "결제를 취소했어요…", 그 외 토스 message + 코드.
 * "다시 시도" → /checkout?c&o&q (failUrl 에 실어 보낸 값) · "판매 페이지로" → 정식 URL (campaign_card 로 확인, 없으면 홈).
 * 공개 URL 파라미터 반사 — code/message 는 failPageReason 이 형식·길이·스푸핑 패턴을 거르고, orderId 는 형식 통과값만 표시.
 */
export const load: PageServerLoad = async (event) => {
	const sp = Object.fromEntries(event.url.searchParams) as Record<string, string | undefined>;
	const code = (sp.code ?? '').slice(0, 80);
	const reason = failPageReason(code, sp.message);
	const orderIdRaw = sp.orderId ?? '';
	const orderId = TOSS_KEY_RE.test(orderIdRaw) ? orderIdRaw : '';

	const params = parseCheckoutParams(sp);
	const card = params ? await fetchCampaignCard(event, params.code) : null;
	const storeHref = card ? canonicalStoreUrl(card) : '/';
	const retryHref = params && card ? checkoutHref(params.code, params.optionIndex, params.qty) : null;
	return { reason, orderId, storeHref, retryHref };
};
