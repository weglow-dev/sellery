<script lang="ts" module>
	export const PAYMENT_METHOD_SELECTOR = '#payment-method';
	export const AGREEMENT_SELECTOR = '#agreement';
</script>

<script lang="ts">
	/** 토스 결제위젯 v2 — 결제 수단(#payment-method) + 약관 동의(#agreement). packages/ui site/checkout/PaymentWidget.svelte 복사 · MYR 다크 테마.
	 *  SDK 는 브라우저 전용 동적 import(onMount). 금액이 바뀌면 setAmount 만. 언마운트 시 destroy. 결제수단 목록은 토스 개발자센터 위젯 설정이 정한다(docs/myr.md §6.7). */
	import { onMount } from 'svelte';
	import type { TossPaymentsWidgets, WidgetAgreementWidget, WidgetPaymentMethodWidget } from '@tosspayments/tosspayments-sdk';

	let {
		clientKey,
		variantKey = 'DEFAULT',
		customerKey,
		amount,
		onReady,
		onError,
		onAgreementChange
	}: {
		clientKey: string;
		variantKey?: string;
		customerKey: string;
		amount: number;
		onReady: (widgets: TossPaymentsWidgets) => void;
		onError: (message: string) => void;
		onAgreementChange?: (agreedRequiredTerms: boolean) => void;
	} = $props();

	const isTestKey = $derived(clientKey.startsWith('test_'));
	let ready = $state(false);
	let failed = $state(false);
	let widgets: TossPaymentsWidgets | null = null;

	onMount(() => {
		if (!clientKey) {
			failed = true;
			onError('결제 위젯 설정이 없어요 (PUBLIC_TOSS_CLIENT_KEY)');
			return;
		}
		let cancelled = false;
		let methods: WidgetPaymentMethodWidget | null = null;
		let agreement: WidgetAgreementWidget | null = null;
		const initialAmount = amount;
		(async () => {
			const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
			const toss = await loadTossPayments(clientKey);
			if (cancelled) return;
			const w = toss.widgets({ customerKey });
			await w.setAmount({ currency: 'KRW', value: initialAmount });
			if (cancelled) return;
			[methods, agreement] = await Promise.all([
				w.renderPaymentMethods({ selector: PAYMENT_METHOD_SELECTOR, variantKey: variantKey || 'DEFAULT' }),
				w.renderAgreement({ selector: AGREEMENT_SELECTOR, variantKey: 'AGREEMENT' })
			]);
			if (cancelled) {
				void methods.destroy().catch(() => {});
				void agreement.destroy().catch(() => {});
				return;
			}
			agreement.on('agreementStatusChange', (st) => onAgreementChange?.(st.agreedRequiredTerms));
			widgets = w;
			ready = true;
			onReady(w);
		})().catch((e: unknown) => {
			if (cancelled) return;
			console.error('[checkout] toss widget load failed', e);
			failed = true;
			onError('결제 위젯을 불러오지 못했어요 — 새로고침 후 다시 시도해주세요');
		});
		return () => {
			cancelled = true;
			widgets = null;
			ready = false;
			if (methods) void methods.destroy().catch(() => {});
			if (agreement) void agreement.destroy().catch(() => {});
		};
	});

	$effect(() => {
		const value = amount;
		if (!ready || !widgets) return;
		void widgets.setAmount({ currency: 'KRW', value }).catch((e: unknown) => console.error('[checkout] setAmount failed', e));
	});
</script>

<div class="rounded-[18px] border border-white/8 bg-white/3 p-2 lg:rounded-[20px]">
	{#if isTestKey}
		<p class="px-2 pt-1.5 pb-1 text-[12px] text-fg-faint">테스트 환경이에요 — 실제 결제가 발생하지 않습니다.</p>
	{/if}
	{#if !ready && !failed}
		<p class="px-2 py-5 text-center text-[13px] text-fg-faint" aria-live="polite">결제 수단을 불러오는 중…</p>
	{/if}
	{#if failed}
		<p class="px-2 py-4 text-[13px] text-[#ff6b6b]">결제 위젯을 불러오지 못했어요 — 새로고침 후 다시 시도해주세요</p>
	{/if}
	<div id="payment-method"></div>
</div>
<div class="mt-3 rounded-[18px] border border-white/8 bg-white/3 p-2 lg:rounded-[20px]">
	<div id="agreement"></div>
</div>
