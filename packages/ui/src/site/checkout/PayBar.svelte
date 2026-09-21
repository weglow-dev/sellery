<script lang="ts">
	/**
	 * 400px 하단 고정 결제 바 (≤640px 에서만 보임 · web components/checkout/order-summary.tsx PayBar).
	 * 페이지 루트(transform 이 걸리는 .card 밖)에 두고, 본문에는 그만큼 하단 여백을 준다 — fixed 가 카드에 갇히지 않게.
	 */
	import PayButton, { type PayButtonProps } from './PayButton.svelte';
	let { total, disabled, submitting, onPay }: PayButtonProps = $props();
</script>

<div class="hidden max-[640px]:block fixed inset-x-0 bottom-0 z-40 bg-bg px-4 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" style="box-shadow:0 -8px 12px -8px rgba(28, 42, 20, 0.25)">
	<PayButton {total} {disabled} {submitting} {onPay} />
</div>
