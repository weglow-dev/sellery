import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { payLine, samplePayHref } from '@sellery/db/partner/sample-rules';
import { parseSuccessParams } from '@sellery/payments/checkout-rules';
import { getProductBrief, getSellerCampaignCode, requireSeller, sellerPath } from '$lib/server/partner';
import { confirmSamplePurchase, getSamplePayment, getSamplePaymentByOrderId } from '$lib/server/payments';

/**
 * `/pay/success` — 토스 successUrl 랜딩(`?paymentKey&orderId&amount`) 또는 🥬 전액 확정 뒤(`?paymentId=`) (docs/inf-console-plan.md §6 `/pay/success` · §5.5 검증 순서).
 * 서버 load 가 `confirmSamplePurchase` 를 정확히 1회 호출한다(고객 체크아웃은 브라우저 fetch — 콘솔은 폼·load 기반, JSON API 없음):
 *   입력 형식(parseSuccessParams — amount 는 ^\d+$) → `getSamplePaymentByOrderId(seller.id, orderId)`(seller 필터 · 없으면 NOT_FOUND 뷰) →
 *   함수 안에서 amount === amount_cash 대조(아니면 FAILED AMOUNT_MISMATCH · 토스 미호출) → confirming 선점 → 토스 confirm → RPC 확정 → 거부면 전액 취소.
 *   `paymentId` 경로는 🥬 전액(amount_cash=0)만 서버가 다시 확정한다(멱등 · already). 현금 행에 paymentId 로 들어오면 확정하지 않고 /pay/<id> 로 보낸다
 *   (실수 방문이 AMOUNT_MISMATCH 로 행을 FAILED 시키지 않도록).
 * 결과: ok → 완료 뷰(프로토타입 confirmSampleBuy: "샘플 구매 완료 — 브랜드 발송 대기" · 🥬 n + ₩m) + 캠페인 링크 · CONFIRMING → "확인 중"(새로고침) ·
 *   그 외 code → `partnerPayFailMessage` 문구 + /pay/<id> 링크. 새로고침은 already:true — 원장·캠페인 1개 유지(§7 4단계 (b)).
 */
export const load: PageServerLoad = async (event) => {
	const sp = event.url.searchParams;
	const r = await requireSeller(event, { next: `/pay/success?${sp.toString()}` });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const paymentIdQ = sp.get('paymentId');
	let paymentId: string;
	let input: { orderId: string; paymentKey: string | null; amountCash: number };
	if (paymentIdQ) {
		const p = await getSamplePayment(seller.id, paymentIdQ);
		if (!p) error(404, { message: '결제 정보를 찾을 수 없습니다' });
		if (p.amount_cash > 0 && p.status !== 'CONFIRMED') redirect(303, sellerPath(`/pay/${encodeURIComponent(p.id)}`));
		paymentId = p.id;
		input = { orderId: p.toss_order_id, paymentKey: p.payment_key, amountCash: p.amount_cash };
	} else {
		const parsed = parseSuccessParams(sp.get('paymentKey'), sp.get('orderId'), sp.get('amount'));
		if (!parsed) return failView('BAD_REQUEST', null, null, null);
		const p = await getSamplePaymentByOrderId(seller.id, parsed.orderId);
		if (!p) return failView('NOT_FOUND', null, null, null);
		paymentId = p.id;
		input = { orderId: parsed.orderId, paymentKey: parsed.paymentKey, amountCash: parsed.amount };
	}

	const outcome = await confirmSamplePurchase(seller.id, paymentId, input);
	const payPath = sellerPath(`/pay/${encodeURIComponent(paymentId)}`);
	if (!outcome.ok) {
		return failView(outcome.code, outcome.message, payPath, outcome.campaignCode ? sellerPath(`/campaigns/${encodeURIComponent(outcome.campaignCode)}`) : null, outcome.canceled);
	}

	const p = await getSamplePayment(seller.id, paymentId);
	const [product, campaignCode] = await Promise.all([
		p?.product_id ? getProductBrief(p.product_id) : Promise.resolve(null),
		outcome.campaignCode ? Promise.resolve(outcome.campaignCode) : outcome.campaignId ? getSellerCampaignCode(seller.id, outcome.campaignId) : Promise.resolve(null)
	]);
	return {
		view: 'ok' as const,
		// paymentId 경로(🥬 전액)는 /pay/new 액션이 이미 확정했으므로 여기 already 는 항상 true — 새로고침 안내는 토스 경로에서만
		already: paymentIdQ ? false : outcome.already,
		amountText: payLine({ amount_total: p?.amount_total ?? outcome.amountCash, amount_cel: outcome.amountCel, amount_cash: outcome.amountCash }),
		amountCel: outcome.amountCel,
		amountCash: outcome.amountCash,
		orderCode: outcome.orderCode,
		product: product ? { name: product.name, emoji: product.emoji, thumb_url: product.thumb_url, brand: product.brand_name, refund: product.sample_refund } : null,
		paths: {
			campaign: campaignCode ? sellerPath(`/campaigns/${encodeURIComponent(campaignCode)}`) : null,
			campaigns: sellerPath('/campaigns'),
			products: sellerPath('/products'),
			pay: payPath,
			retry: product?.code ? samplePayHref(product.code) : null
		}
	};
};

function failView(code: string, message: string | null, payPath: string | null, campaignPath: string | null, canceled = false) {
	return {
		view: 'fail' as const,
		code,
		message,
		pending: code === 'CONFIRMING',
		canceled,
		paths: { pay: payPath, campaign: campaignPath, campaigns: sellerPath('/campaigns'), products: sellerPath('/products') }
	};
}
