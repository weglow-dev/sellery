<script lang="ts" module>
	/** 결제 금액 박스가 받는 요약 (web components/checkout/order-summary.tsx PaySummary) */
	export type PaySummary = { productName: string; qty: number; total: number; clearDays: number };
	/** [₩{total} 결제하기] 버튼 상태 — OrderSummary(≥641px) 와 PayBar(≤640px) 가 같은 값을 받는다 */
	export type PayButtonProps = { total: number; disabled: boolean; submitting: boolean; onPay: () => void };
</script>

<script lang="ts">
	/** `pri buy` 결제 버튼 (web order-summary.tsx PayButton) — 준비 중이면 "결제 준비 중…" */
	import { won } from '@sellery/db/campaign';
	let { total, disabled, submitting, onPay }: PayButtonProps = $props();
</script>

<button type="button" class="pri buy" onclick={onPay} disabled={disabled || submitting} aria-busy={submitting || undefined} style="margin:6px 0 4px">
	{submitting ? '결제 준비 중…' : `${won(total)} 결제하기`}
</button>
