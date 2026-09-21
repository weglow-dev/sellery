import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isPayable, partnerPayFailMessage, partnerPaymentStatusLabel, payLine, samplePayHref } from '@sellery/db/partner/sample-rules';
import { getProductBrief, getSellerCampaignCode, RATE_LIMIT_MESSAGE, rateLimit, requireSeller, sellerPath } from '$lib/server/partner';
import { cancelSamplePurchase, getSamplePayment } from '$lib/server/payments';

/**
 * `/pay/[id]` — 샘플 결제 화면 (docs/inf-console-plan.md §6 `/pay/[id]` · §5.2 토스 결제위젯 v2 재사용 · 프로토타입 sampleBuyModal 의 결제 단계).
 * load: `getSamplePayment(seller.id, id)` — **seller_id 필터, 남의 id·없는 id 는 404**(id 는 uuid 지만 success/fail URL 에 실려 공유될 수 있다).
 *   PENDING + 만료 전(`isPayable`) → 요약 + 토스 위젯(amount = amount_cash · orderId = toss_order_id · orderName). 그 외(CONFIRMING · CONFIRMED · FAILED · CANCELED · EXPIRED · REFUNDED)는
 *   상태 칩 + 문구 + 링크(캠페인 · 상품 · 다시 시도)만 — 위젯 없음. 🥬 전액(amount_cash=0) PENDING 은 이 화면에 오지 않는다(/pay/new 액션이 바로 확정).
 * action cancel: 결제 전 그만둠 — `cancelSamplePurchase`(PENDING · payment_key 없는 CONFIRMING 만) → 상품 상세로. 종결 행은 already 로 같은 곳.
 * successUrl/failUrl 은 브라우저가 `window.location.origin` + 콘솔 경로로 만든다(§5.2 — Preview 마다 env 를 바꾸지 않는다).
 */
export const load: PageServerLoad = async (event) => {
	const id = event.params.id;
	const r = await requireSeller(event, { next: `/pay/${encodeURIComponent(id)}` });
	if (!r.ok) redirect(303, r.location);
	const { seller, user } = r.ctx;

	const p = await getSamplePayment(seller.id, id);
	if (!p) error(404, { message: '결제 정보를 찾을 수 없습니다' });

	const [product, campaignCode] = await Promise.all([
		p.product_id ? getProductBrief(p.product_id) : Promise.resolve(null),
		p.campaign_id ? getSellerCampaignCode(seller.id, p.campaign_id) : Promise.resolve(null)
	]);
	const payable = isPayable(p.status, p.expires_at);
	const productCode = product?.code ?? null;
	// PENDING 인데 만료 시각이 지났다(크론이 아직 EXPIRED 로 바꾸기 전) — 화면은 만료로 그린다
	const shownStatus = p.status === 'PENDING' && !payable ? 'EXPIRED' : p.status;
	const ended = shownStatus === 'FAILED' || shownStatus === 'CANCELED' || shownStatus === 'EXPIRED';

	return {
		payment: {
			id: p.id,
			status: shownStatus,
			toss_order_id: p.toss_order_id,
			order_name: p.order_name,
			amount_total: p.amount_total,
			amount_cel: p.amount_cel,
			amount_cash: p.amount_cash,
			cel_won: p.cel_won,
			fail_code: p.fail_code,
			expires_at: p.expires_at
		},
		payable,
		chip: partnerPaymentStatusLabel(shownStatus, p.fail_code),
		amountText: payLine(p),
		failText: ended ? partnerPayFailMessage(p.fail_code ?? shownStatus, p.fail_message) : null,
		product: product ? { code: productCode, name: product.name, emoji: product.emoji, thumb_url: product.thumb_url, brand: product.brand_name, refund: product.sample_refund } : null,
		customer: { key: user.id, name: seller.name, email: user.email ?? null },
		paths: {
			success: sellerPath('/pay/success'),
			fail: `${sellerPath('/pay/fail')}?id=${encodeURIComponent(p.id)}`,
			product: productCode ? `${sellerPath(`/products/${encodeURIComponent(productCode)}`)}#sample` : sellerPath('/products'),
			retry: productCode ? samplePayHref(productCode) : null,
			campaign: campaignCode ? sellerPath(`/campaigns/${encodeURIComponent(campaignCode)}`) : null,
			campaigns: sellerPath('/campaigns')
		}
	};
};

export const actions: Actions = {
	cancel: async (event) => {
		const id = event.params.id;
		const r = await requireSeller(event, { next: `/pay/${encodeURIComponent(id)}` });
		if (!r.ok) redirect(303, r.location);
		const self = sellerPath(`/pay/${encodeURIComponent(id)}`);
		if (!rateLimit(`sample-pay-cancel:${r.ctx.user.id}`)) error(429, { message: RATE_LIMIT_MESSAGE });

		const p = await getSamplePayment(r.ctx.seller.id, id);
		if (!p) error(404, { message: '결제 정보를 찾을 수 없습니다' });
		const res = await cancelSamplePurchase(r.ctx.seller.id, id, '인플루언서가 결제 화면에서 취소');
		if (!res.ok) redirect(303, self); // 종결된 행 — 화면이 상태를 그린다

		const product = p.product_id ? await getProductBrief(p.product_id) : null;
		redirect(303, product?.code ? `${sellerPath(`/products/${encodeURIComponent(product.code)}`)}#sample` : sellerPath('/products'));
	}
};
