<script lang="ts">
	/**
	 * 내 주문 목록 행 `.rowitem.cart-row` (프로토타입 js/60-customer.js vCustOrders L315-317 · ux-spec §3.6 · web components/orders/order-row.tsx).
	 *   pIcon 44 · .nm {product.name} <sub>· {option_name} × {qty}</sub> · .sub {CODE} · {md(paid_at)} 주문 · {brand} 직배송{ · ship}
	 *   · .st 칩 · .cart-sum ₩{amount} · [문의] [환불 신청(PAID·비SETTLED·미발송·비샘플만)]
	 */
	import { md } from '@sellery/db/dates';
	import { isRefundable, orderStatusLabel, shipLabel, won } from '@sellery/db/order-status';
	import StatusChip from '../StatusChip.svelte';
	import ProductIcon from '../ProductIcon.svelte';
	import CsModalButton from '../CsModalButton.svelte';
	import RefundButton from './RefundButton.svelte';
	import type { OrderSettings, OrderView } from './types';

	let { order, settings, onRefreshed }: { order: OrderView; settings: OrderSettings; onRefreshed: () => void | Promise<void> } = $props();

	const st = $derived(orderStatusLabel(order, order.campaign));
	const ship = $derived(shipLabel(order, order.campaign, settings));
	const refundable = $derived(isRefundable(order, order.campaign).ok);
	const code = $derived(order.code.toUpperCase());
	const href = $derived(`/account/orders/${encodeURIComponent(order.code)}`);
</script>

<div class="rowitem cart-row">
	<a {href} aria-label="주문 {code} 상세" style="display:inline-flex;flex:none"><ProductIcon thumbUrl={order.product.thumb_url} emoji={order.product.emoji} size={44} /></a>
	<div class="grow" style="min-width:160px">
		<a {href} class="nm">{order.product.name} <span class="sub" style="font-weight:400">· {order.option_name || '기본'} × {order.qty}</span></a>
		<div class="sub">{code} · {md(order.paid_at)} 주문 · {order.brand.name} 직배송{ship ? ` · ${ship}` : ''}</div>
	</div>
	<StatusChip tone={st.tone}>{st.label}</StatusChip>
	<div class="cart-sum">{won(order.amount)}</div>
	<div class="rowacts">
		<CsModalButton class="sm" productName={order.product.name} thumbUrl={order.product.thumb_url} emoji={order.product.emoji} brandName={order.brand.name} orderCode={order.code}>문의</CsModalButton>
		{#if refundable}
			<RefundButton class="sm ghost" code={order.code} productName={order.product.name} optionName={order.option_name} qty={order.qty} amount={order.amount} {onRefreshed} />
		{/if}
	</div>
</div>
