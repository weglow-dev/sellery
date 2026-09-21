<script lang="ts">
	/**
	 * 샘플 결제 위젯 단계 — 고객 체크아웃 CheckoutClient.svelte 의 위젯 부분만 (docs/inf-console-plan.md §5.2 "결제위젯 v2 재사용").
	 *   PaymentWidget(@sellery/ui/site — 결제 수단 #payment-method + 약관 #agreement) → onReady → [₩N 결제하기] →
	 *   widgets.requestPayment({ orderId: toss_order_id, orderName, successUrl: origin + /influencer/pay/success, failUrl: origin + /influencer/pay/fail?id=…, customerName, customerEmail })
	 * 금액은 서버 행(amount_cash)이 진실 — 여기서는 표시·setAmount 만. Redirect 방식: 결제창이 닫히지 않는 한 requestPayment 아래는 실행되지 않는다.
	 * 토스는 successUrl 에 paymentKey · orderId · amount 를, failUrl 에 code · message · orderId 를 붙인다 → 각 서버 load 가 처리.
	 */
	import { PUBLIC_TOSS_CLIENT_KEY } from '$env/static/public';
	import { env } from '$env/dynamic/public';
	import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
	import { fmtNum } from '@sellery/db/campaign';
	import { PaymentWidget, showToast } from '@sellery/ui/site';

	let {
		amount,
		orderId,
		orderName,
		customerKey,
		customerName,
		customerEmail,
		successPath,
		failPath
	}: {
		/** partner_payments.amount_cash — 토스 청구액 */
		amount: number;
		/** partner_payments.toss_order_id (slrp_…) */
		orderId: string;
		orderName: string;
		/** 토스 customerKey = user.id */
		customerKey: string;
		customerName: string;
		customerEmail: string | null;
		/** 콘솔 상대 경로 — origin 은 브라우저에서 붙인다 */
		successPath: string;
		failPath: string;
	} = $props();

	const variantKey = env.PUBLIC_TOSS_WIDGET_VARIANT || 'DEFAULT-2';
	let widgets: TossPaymentsWidgets | null = null;
	let ready = $state(false);
	let widgetError = $state<string | null>(null);
	let submitting = $state(false);
	let agreedRequired = $state(true); // 토스 약관 UI 가 이벤트를 주기 전에는 위젯 자체가 거절하도록 둔다

	const onReady = (w: TossPaymentsWidgets) => {
		widgets = w;
		ready = true;
	};
	const onWidgetError = (m: string) => (widgetError = m);
	const onAgreementChange = (v: boolean) => (agreedRequired = v);

	async function handlePay() {
		if (!widgets || submitting) return;
		submitting = true;
		try {
			await widgets.setAmount({ currency: 'KRW', value: amount });
			const origin = window.location.origin;
			await widgets.requestPayment({
				orderId,
				orderName,
				successUrl: `${origin}${successPath}`,
				failUrl: `${origin}${failPath}`,
				customerName: customerName.slice(0, 100),
				customerEmail: customerEmail || undefined
			});
			// Redirect 방식: 여기 아래는 결제창이 닫히지 않는 한 실행되지 않는다
		} catch (e) {
			// 결제창 닫힘(USER_CANCEL) · 팝업 차단 · 결제 수단 미선택 등 — 콘솔 셸에는 ToastHost 가 없으므로 카드 안에 그대로 보여준다
			console.error('[pay] requestPayment failed', e);
			const message = e instanceof Error && e.message ? e.message : '결제 요청에 실패했어요 — 다시 시도해주세요';
			payError = message;
			showToast(message);
			submitting = false;
		}
	}

	let payError = $state<string | null>(null);
	const payDisabled = $derived(!ready || !!widgetError || !agreedRequired);
</script>

<PaymentWidget clientKey={PUBLIC_TOSS_CLIENT_KEY} {variantKey} {customerKey} {amount} {onReady} onError={onWidgetError} {onAgreementChange} />

<div class="card static">
	{#if payError}<div class="notice danger" role="alert" style="margin:0 0 10px">{payError}</div>{/if}
	<div class="btnrow" style="justify-content:flex-end">
		<button type="button" class="pri buy" onclick={handlePay} disabled={payDisabled || submitting} aria-busy={submitting || undefined}>
			{submitting ? '결제 준비 중…' : `₩${fmtNum(amount)} 결제하기`}
		</button>
	</div>
</div>
