<script lang="ts">
	/** 주문 상세 — 회원(/orders/[code]) · 비회원(/orders/g/[code]) 공용. 줄 · 금액 · 배송 상태 · 입금 안내(가상계좌) · 배송지. 환불·문의 버튼은 다음 단계. */
	import { won } from '$lib/data';
	import { displayCode, shortDate, statusLabel, type OrderView } from '$lib/order-view';
	import RefundPanel from '$lib/components/RefundPanel.svelte';
	import Tile from '$lib/components/Tile.svelte';

	let { order }: { order: OrderView } = $props();
	const label = $derived(statusLabel(order));
	const tone: Record<string, string> = { accent: 'bg-accent/12 text-accent', muted: 'bg-white/8 text-white/55', danger: 'bg-[#ff6b6b]/12 text-[#ff6b6b]', ok: 'bg-[#4ade80]/12 text-[#4ade80]' };
	const dueText = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
	const lineStatus = (s: string, refunded: number, qty: number) => (s === 'REFUNDED' ? '환불 완료' : s === 'PARTIAL_REFUNDED' ? `${refunded}/${qty} 환불` : s === 'CANCELED' ? '취소' : '');
</script>

<div class="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
	<div class="flex flex-col gap-3.5">
		<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[20px] lg:px-5">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="font-mono text-[13px] font-bold">{displayCode(order.code)}</p>
					<p class="mt-0.5 text-[12px] text-fg-faint">{shortDate(order.createdAt)} 주문{order.paymentMethod ? ` · ${order.paymentMethod}` : ''}</p>
				</div>
				<span class="shrink-0 rounded-full px-2.5 py-[5px] text-[12px] font-bold {tone[label.tone]}">{label.text}</span>
			</div>
			{#if order.status === 'WAITING_DEPOSIT' && order.deposit}
				<div class="mt-3.5 rounded-[14px] border border-accent/30 bg-accent/8 px-4 py-3.5">
					<p class="text-[12.5px] font-bold text-accent">가상계좌 입금 안내</p>
					<p class="mt-1 text-[15px] font-bold">{order.deposit.bank} {order.deposit.account}</p>
					{#if order.deposit.holder}<p class="text-[13px] text-white/70">예금주 {order.deposit.holder}</p>{/if}
					<p class="mt-1 text-[13px] text-white/70">입금 금액 <b class="text-fg">{won(order.amount)}</b>{#if order.deposit.due} · 기한 {dueText(order.deposit.due)}{/if}</p>
				</div>
			{/if}
			{#if order.trackingNo}
				<p class="mt-3 text-[13px] text-white/75">{order.courier ?? '택배'} <span class="font-mono">{order.trackingNo}</span>{#if order.shippedAt} · {shortDate(order.shippedAt)} 발송{/if}</p>
			{/if}
		</div>

		<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 pt-1 pb-2 lg:rounded-[20px] lg:px-5">
			{#each order.items as it (it.id)}
				{@const ls = lineStatus(it.status, it.refundedQty, it.qty)}
				<div class="flex items-center gap-3 border-b border-white/6 py-3 last:border-b-0">
					<a href="/p/{it.code}" aria-label={it.name}><Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt={it.name} icon={26} class="h-[52px] w-[52px] rounded-xl" /></a>
					<div class="min-w-0 flex-1">
						{#if it.creator}<p class="text-[11px] font-bold text-accent">{it.creator}</p>{/if}
						<p class="truncate text-[14px] font-bold">{it.name}{#if it.option} · {it.option}{/if}</p>
						<p class="mt-0.5 text-[12px] text-fg-faint">{won(it.unitPrice)} × {it.qty}{#if ls} · <span class="text-white/55">{ls}</span>{/if}</p>
					</div>
					<span class="text-[14px] font-extrabold">{won(it.amount)}</span>
				</div>
			{/each}
		</div>

		{#if order.shipping}
			<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[20px] lg:px-5">
				<p class="text-[13px] font-bold text-fg-faint">배송지</p>
				<p class="mt-1.5 text-[14px] font-bold">{order.shipping.recipient} <span class="font-normal text-white/70">{order.shipping.phone}</span></p>
				<p class="mt-0.5 text-[14px] text-white/80">{#if order.shipping.postcode}({order.shipping.postcode}) {/if}{order.shipping.address1} {order.shipping.address2}</p>
				{#if order.shipping.memo}<p class="mt-1 text-[13px] text-fg-faint">메모: {order.shipping.memo}</p>{/if}
			</div>
		{/if}
	</div>

	<aside class="rounded-[18px] border border-white/8 bg-panel p-5 lg:sticky lg:top-[104px] lg:rounded-3xl lg:p-6">
		<p class="mb-3 text-[15px] font-extrabold">결제 금액</p>
		<div class="flex flex-col gap-2 text-[14px]">
			<div class="flex justify-between text-fg-soft"><span>상품 금액</span><span class="font-semibold text-fg">{won(order.itemsAmount)}</span></div>
			<div class="flex justify-between text-fg-soft"><span>배송비</span><span class="font-semibold text-fg">{order.shippingFee ? won(order.shippingFee) : '무료'}</span></div>
			{#if order.refundAmount}
				<div class="flex justify-between text-fg-soft"><span>환불</span><span class="font-semibold text-[#ff6b6b]">−{won(order.refundAmount)}</span></div>
			{/if}
			<div class="flex items-baseline justify-between border-t border-white/8 pt-2"><span class="font-bold">{order.status === 'WAITING_DEPOSIT' ? '입금할 금액' : '총 결제 금액'}</span><span class="text-[20px] font-extrabold text-accent">{won(order.amount)}</span></div>
		</div>
		<RefundPanel {order} />
		<p class="mt-3 text-[12px] leading-[1.55] text-fg-faint">문의는 곧 열려요. 급한 문의는 마이페이지의 고객센터로.</p>
	</aside>
</div>
