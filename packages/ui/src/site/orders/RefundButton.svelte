<script lang="ts">
	/**
	 * 환불 신청 버튼 + 모달 (web account/orders/[code]/refund-button.tsx RefundButton).
	 * 버튼은 호출자가 isRefundable() 통과 주문에만 렌더한다 (PAID · 비샘플 · 비SETTLED · 미발송). 서버 precheck 가 최종 가드.
	 */
	import RefundModal from './RefundModal.svelte';
	let {
		class: cls = 'sm ghost',
		onRefreshed,
		...rest
	}: {
		class?: string;
		code: string;
		productName: string;
		optionName: string | null;
		qty: number;
		amount: number;
		onRefreshed: () => void | Promise<void>;
	} = $props();
	let open = $state(false);
</script>

<button type="button" class={cls} onclick={() => (open = true)}>환불 신청</button>
<RefundModal {open} onClose={() => (open = false)} {onRefreshed} {...rest} />
