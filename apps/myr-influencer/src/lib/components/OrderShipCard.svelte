<script lang="ts">
	/** "주문 · 배송" 카드 — 문의 상세 · 교환·환불 요청 상세 공용(표는 `$lib/order-ship` orderShipping) */
	import type { OrderShipping } from '$lib/order-ship';
	let { title, ship }: { title: string; ship: OrderShipping } = $props();
</script>

<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
	<div class="flex items-center justify-between gap-2">
		<span class="text-[14px] font-bold lg:text-[15px]">{title}</span>
		<span class="rounded-lg px-2.5 py-[5px] text-[12px] font-bold whitespace-nowrap lg:text-[13px] {ship.cls}">{ship.label}</span>
	</div>
	<dl class="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3 text-[13px] lg:text-[14px]">
		{#each ship.rows as r, i (i)}
			<div class="flex justify-between gap-4">
				<dt class="shrink-0 text-white/55">{r.k}</dt>
				<dd class="min-w-0 text-right font-semibold text-fg">
					{#if r.href}<a href={r.href} target="_blank" rel="noopener noreferrer" class="underline decoration-white/30 underline-offset-2 hover:text-accent">{r.v}</a>{:else}{r.v}{/if}
				</dd>
			</div>
		{/each}
	</dl>
</div>
