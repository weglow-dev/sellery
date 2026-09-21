import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isPayable, partnerFailCode, partnerFailPageReason, payLine, samplePayHref } from '@sellery/db/partner/sample-rules';
import { TOSS_KEY_RE } from '@sellery/payments/checkout-rules';
import { getProductBrief, requireSeller, sellerPath } from '$lib/server/partner';
import { recordSampleWidgetFailure } from '$lib/server/payments';

/**
 * `/pay/fail?code&message&orderId&id` — 토스 failUrl 랜딩 (docs/inf-console-plan.md §6 `/pay/fail` · §5.7 첫 줄 · 고객 checkout/fail 1:1).
 * 위젯 단계 실패만 온다(사용자 취소 · 카드사 거절) — 토스에 승인 기록이 없다. `recordSampleWidgetFailure`(seller 필터):
 *   사용자 취소(PAY_PROCESS_CANCELED 등) → PENDING 유지 → [다시 시도] = /pay/<id>(같은 행 · 위젯 다시) · 그 외 code → FAILED(code) → [다시 시도] = /pay/new?product=(새 선점).
 * 공개 URL 파라미터 반사 — code/message 는 `partnerFailPageReason` 이 형식·길이·스푸핑 패턴을 거르고, orderId 는 형식 통과값만 표시.
 */
export const load: PageServerLoad = async (event) => {
	const sp = event.url.searchParams;
	const r = await requireSeller(event, { next: `/pay/fail?${sp.toString()}` });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const code = partnerFailCode(sp.get('code'));
	const reason = partnerFailPageReason(sp.get('code'), sp.get('message'));
	const orderIdRaw = sp.get('orderId') ?? '';
	const orderId = TOSS_KEY_RE.test(orderIdRaw) ? orderIdRaw : null;
	const id = sp.get('id');

	const { payment, kept } = await recordSampleWidgetFailure(seller.id, { orderId, paymentId: id }, { code, message: sp.get('message') });
	const product = payment?.product_id ? await getProductBrief(payment.product_id) : null;
	const payable = !!payment && kept && isPayable(payment.status, payment.expires_at);

	return {
		reason,
		code,
		orderId: payment?.toss_order_id ?? orderId,
		amountText: payment ? payLine(payment) : null,
		productName: product?.name ?? null,
		paths: {
			retry: payable && payment ? sellerPath(`/pay/${encodeURIComponent(payment.id)}`) : product?.code ? samplePayHref(product.code) : null,
			product: product?.code ? `${sellerPath(`/products/${encodeURIComponent(product.code)}`)}#sample` : sellerPath('/products')
		}
	};
};
