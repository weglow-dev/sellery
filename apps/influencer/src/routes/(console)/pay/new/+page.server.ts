import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	SAMPLE_PAY_CANCEL_NOTICE,
	SAMPLE_PAY_CEL_NOTICE,
	parseShippingInput,
	parseStoredShipping,
	partnerPayFailMessage,
	type ShippingField
} from '@sellery/db/partner/sample-rules';
import { getProductForSeller, quoteSample, RATE_LIMIT_MESSAGE, rateLimit, requireSeller, sellerPath } from '$lib/server/partner';
import { beginSamplePurchase, confirmSamplePurchase } from '$lib/server/payments';

/**
 * `/pay/new?product=<code>` — 샘플 구매 결제 준비 (docs/inf-console-plan.md §6 `/products/[code]` "[샘플 구매] → /pay/new?product=" · §5.3 · §5.5 · 프로토타입 sampleBuyModal).
 * load: `requireSeller` → `getProductForSeller` (listed 아니면 404) → 견적 mode 가 'buy' 가 아니면 상품 상세(무상 요청)·진행 중 캠페인으로 보낸다.
 *   견적은 두 벌 — 🥬 미사용(`product.quote`) · 🥬 사용(`quoteSample(use_cel=true)`, 잔액으로 잘린 분할) — 화면의 토글이 둘 중 하나를 보여준다.
 *   배송지 프리필 `sellers.sample_address`. 금액·🥬 개수는 서버(quote)가 정하고 선점 RPC 가 다시 계산한다(표시 = 청구, §5.3).
 * action begin: `parseShippingInput` → `beginSamplePurchase(seller, code, use_cel, shipping)` →
 *   현금 필요(cashRequired) → `/pay/<id>`(토스 위젯) · 🥬 전액 → 위젯 없이 `confirmSamplePurchase(paymentKey null, amountCash 0)` 바로 → `/pay/success?paymentId=`
 *   (확정 실패는 `/pay/<id>` 가 상태·문구를 그린다). 선점 실패는 `fail(400, { message, field, values })` — 입력값 유지.
 *   NOT_BUYABLE 은 mode 로 분기: free → 상품 상세(무상 요청) · active → 그 캠페인.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.url.searchParams.get('product') ?? '';
	const r = await requireSeller(event, { next: `/pay/new?product=${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const found = code ? await getProductForSeller(seller.id, code) : null;
	if (!found) error(404, { message: '상품을 찾을 수 없습니다' });
	const { product } = found;
	const q = product.quote;
	const productHref = `${sellerPath(`/products/${encodeURIComponent(product.code ?? code)}`)}#sample`;
	if (!q || q.mode !== 'buy') {
		if (q?.mode === 'active' && q.campaign_code) redirect(303, sellerPath(`/campaigns/${encodeURIComponent(q.campaign_code)}`));
		redirect(303, productHref);
	}
	const qCel = await quoteSample(seller.id, product.id, true);

	return {
		seller: { name: seller.name, grade: seller.grade },
		balance,
		product: {
			code: product.code ?? code,
			name: product.name,
			emoji: product.emoji,
			thumb_url: product.thumb_url,
			brand: product.brand.name,
			sale_price: product.sale_price,
			commission_rate: product.commission_rate
		},
		quoteCash: q,
		quoteCel: qCel && qCel.mode === 'buy' ? qCel : null,
		shipping: parseStoredShipping(seller.sample_address),
		productHref,
		notices: { cel: SAMPLE_PAY_CEL_NOTICE, cancel: SAMPLE_PAY_CANCEL_NOTICE }
	};
};

export const actions: Actions = {
	begin: async (event) => {
		const code = event.url.searchParams.get('product') ?? '';
		const r = await requireSeller(event, { next: `/pay/new?product=${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const { seller, user } = r.ctx;
		const formData = await event.request.formData();
		const values = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const useCel = formData.get('use_cel') === 'on';
		const bad = (message: string, field: ShippingField | 'shipping' | null = null) => fail(400, { message, field, values });

		if (!rateLimit(`sample-pay:${user.id}`)) return bad(RATE_LIMIT_MESSAGE);
		const parsed = parseShippingInput(formData);
		if (!parsed.ok) return bad(partnerPayFailMessage('BAD_SHIPPING'), parsed.field);

		const res = await beginSamplePurchase(seller.id, code, useCel, parsed.shipping, { userId: user.id });
		if (!res.ok) {
			if (res.code === 'BAD_SHIPPING') return bad(partnerPayFailMessage('BAD_SHIPPING'), (res.field as ShippingField | undefined) ?? 'shipping');
			if (res.code === 'NOT_BUYABLE') {
				if (res.mode === 'active' && res.quote?.campaign_code) redirect(303, sellerPath(`/campaigns/${encodeURIComponent(res.quote.campaign_code)}`));
				if (res.mode === 'free') redirect(303, `${sellerPath(`/products/${encodeURIComponent(code)}`)}#sample`);
				return bad(partnerPayFailMessage(res.code));
			}
			return bad(partnerPayFailMessage(res.code));
		}

		const payPath = sellerPath(`/pay/${encodeURIComponent(res.paymentId)}`);
		if (res.cashRequired) redirect(303, payPath);

		// 🥬 전액 — 위젯 없이 바로 확정 (§5.5 마지막 단락). 실패하면 /pay/<id> 가 상태(FAILED 문구 · 확인 중)를 그린다.
		const done = await confirmSamplePurchase(seller.id, res.paymentId, { orderId: res.orderId, paymentKey: null, amountCash: 0 });
		if (!done.ok) redirect(303, payPath);
		redirect(303, `${sellerPath('/pay/success')}?paymentId=${encodeURIComponent(res.paymentId)}`);
	}
};
