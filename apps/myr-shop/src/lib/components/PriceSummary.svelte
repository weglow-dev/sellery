<script lang="ts">
	import { won } from '$lib/data';
	import Spinner from './Spinner.svelte';

	/** 상품 금액 · 배송비 · 총 결제 금액 — 장바구니 하단과 결제 화면 공용. 값은 서버 견적 그대로.
	 *  받기 전(null)이면 숫자 자리에 스피너 · 견적을 받지 못했으면(failed) "—"(계속 도는 것처럼 보이지 않게) */
	let { subtotal, shipping, total, failed = false, boxed = false }: { subtotal: number | null; shipping: number | null; total: number | null; failed?: boolean; boxed?: boolean } = $props();
</script>

{#snippet amount(n: number | null, zero: string | null = null)}
	{#if n === null}{#if failed}—{:else}<Spinner />{/if}{:else if n === 0 && zero !== null}{zero}{:else}{won(n)}{/if}
{/snippet}

<div class="flex flex-col gap-2 text-[14px] {boxed ? 'rounded-[18px] border border-white/7 bg-white/3 p-4' : 'px-1 pb-3.5'}">
	<div class="flex justify-between text-fg-soft"><span>상품 금액</span><span class="font-semibold text-fg">{@render amount(subtotal)}</span></div>
	<div class="flex justify-between text-fg-soft"><span>배송비</span><span class="font-semibold text-fg">{@render amount(shipping, '무료')}</span></div>
	<div class="flex items-baseline justify-between border-t border-white/8 pt-2"><span class="font-bold">총 결제 금액</span><span class="text-[20px] font-extrabold text-accent">{@render amount(total)}</span></div>
</div>
