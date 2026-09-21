<script lang="ts">
	/**
	 * 결제 금액 박스 `.card.cart-side` (ux-spec §3.4 우측 — 프로토타입 vCustCart 결제 금액 박스 원문 · web components/checkout/order-summary.tsx OrderSummary).
	 *   table.stmt  {product} × {q} | ₩{sum} · 배송비 | 무료 · 브랜드 직배송 · tr.tot 총 결제 | ₩{total}
	 *   [ ₩{total} 결제하기 ] pri buy · .meta 결제 대금은 셀러리가 보관 · 판매 종료 후 {n}일 환불 보호
	 * ≤640px 에서는 카드 안 버튼을 숨기고 <PayBar/>(fixed bottom) 가 같은 버튼을 보여 준다.
	 */
	import { won } from '@sellery/db/campaign';
	import PayButton, { type PayButtonProps, type PaySummary } from './PayButton.svelte';
	let { summary, pay }: { summary: PaySummary; pay: PayButtonProps } = $props();
</script>

<div class="card static cart-side">
	<h4>결제 금액</h4>
	<table class="stmt" style="min-width:0;font-size:13px">
		<tbody>
			<tr>
				<td>{summary.productName} × {summary.qty}</td>
				<td class="num">{won(summary.total)}</td>
			</tr>
			<tr>
				<td>배송비</td>
				<td class="num" style="font-family:var(--font-sans)">무료 · 브랜드 직배송</td>
			</tr>
			<tr class="tot">
				<td>총 결제</td>
				<td class="num">{won(summary.total)}</td>
			</tr>
		</tbody>
	</table>
	<div class="max-[640px]:hidden" style="margin-top:12px">
		<PayButton {...pay} />
	</div>
	<div class="meta" style="text-align:center;margin-top:8px">결제 대금은 <b>셀러리</b>가 보관 · 판매 종료 후 {summary.clearDays}일 환불 보호</div>
</div>
