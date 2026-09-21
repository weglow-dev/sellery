<script lang="ts" module>
	export const PAYMENT_METHOD_SELECTOR = '#payment-method';
	export const AGREEMENT_SELECTOR = '#agreement';
	const AGREEMENT_VARIANT_KEY = 'AGREEMENT';
</script>

<script lang="ts">
	/**
	 * 토스 결제위젯 v2 — 결제 수단 카드(#payment-method) + 약관 동의 카드(#agreement) (web components/checkout/payment-widget.tsx 1:1).
	 *   loadTossPayments(clientKey) → widgets({ customerKey: user.id }) → setAmount → renderPaymentMethods + renderAgreement
	 *   금액이 바뀌면 setAmount 만 다시 호출(재렌더 없음). 언마운트 시 렌더된 위젯을 destroy.
	 * SDK 는 **브라우저 전용 동적 import**(onMount) — SSR 번들에 들어가지 않는다 (docs/monorepo-migration.md §3.2).
	 * clientKey = PUBLIC_TOSS_CLIENT_KEY · variantKey = PUBLIC_TOSS_WIDGET_VARIANT || "DEFAULT-2" — 앱이 `$env` 에서 읽어 props 로 넘긴다(패키지는 `$env` 를 모른다).
	 * 테스트 키(test_)면 안내 문구를 보여 준다 (reuse-map §4-3 IS_TEST_KEY).
	 */
	import { onMount, type Snippet } from 'svelte';
	import type { TossPaymentsWidgets, WidgetAgreementWidget, WidgetPaymentMethodWidget } from '@tosspayments/tosspayments-sdk';

	let {
		clientKey,
		variantKey = 'DEFAULT-2',
		customerKey,
		amount,
		onReady,
		onError,
		onAgreementChange,
		agreementExtra
	}: {
		/** PUBLIC_TOSS_CLIENT_KEY (결제위젯 키 test_gck_/live_gck_) */
		clientKey: string;
		/** PUBLIC_TOSS_WIDGET_VARIANT — 없으면 "DEFAULT-2" */
		variantKey?: string;
		/** 토스 customerKey — 로그인 사용자 id (UUID, 2~50자 규칙 충족) */
		customerKey: string;
		/** 현재 표시 금액 — 서버 확정 금액은 결제 직전 부모가 setAmount 로 다시 넣는다 */
		amount: number;
		onReady: (widgets: TossPaymentsWidgets) => void;
		/** 위젯 로드 실패 (사용자 문구) */
		onError: (message: string) => void;
		/** 필수 약관 동의 상태 (agreementStatusChange) */
		onAgreementChange?: (agreedRequiredTerms: boolean) => void;
		/** 약관 카드 안, 토스 약관 UI 아래에 붙는 추가 항목 (통신판매중개자 확인 체크박스) */
		agreementExtra?: Snippet;
	} = $props();

	const isTestKey = $derived(clientKey.startsWith('test_'));
	let ready = $state(false);
	// 클라이언트 키는 빌드 시 상수 — 없으면 마운트 즉시 실패 상태
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
		const variant = variantKey || 'DEFAULT-2';
		const initialAmount = amount;

		(async () => {
			const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
			const toss = await loadTossPayments(clientKey);
			if (cancelled) return;
			const w = toss.widgets({ customerKey });
			await w.setAmount({ currency: 'KRW', value: initialAmount });
			if (cancelled) return;
			[methods, agreement] = await Promise.all([
				w.renderPaymentMethods({ selector: PAYMENT_METHOD_SELECTOR, variantKey: variant }),
				w.renderAgreement({ selector: AGREEMENT_SELECTOR, variantKey: AGREEMENT_VARIANT_KEY })
			]);
			if (cancelled) {
				// 늦게 끝난 렌더는 지운다
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

	// 표시 금액 변경 → setAmount 만 (마운트 시 금액은 초기화 경로에서 넣었다)
	$effect(() => {
		const value = amount;
		if (!ready || !widgets) return;
		void widgets.setAmount({ currency: 'KRW', value }).catch((e: unknown) => {
			console.error('[checkout] setAmount failed', e);
		});
	});
</script>

<div class="card static">
	<h4>결제 수단</h4>
	{#if isTestKey}
		<div class="notice" style="margin:0 0 10px">테스트 환경입니다 — 실제 결제가 발생하지 않습니다.</div>
	{/if}
	{#if !ready && !failed}
		<div class="empty" style="padding:18px" aria-live="polite">결제 수단을 불러오는 중…</div>
	{/if}
	{#if failed}
		<div class="notice danger" style="margin:0">결제 위젯을 불러오지 못했어요 — 새로고침 후 다시 시도해주세요</div>
	{/if}
	<div id="payment-method"></div>
</div>
<div class="card static">
	<h4>약관 동의</h4>
	<div id="agreement"></div>
	{#if agreementExtra}<div style="margin-top:10px">{@render agreementExtra()}</div>{/if}
</div>
