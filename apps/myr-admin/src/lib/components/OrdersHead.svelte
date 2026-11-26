<script lang="ts">
	import type { Snippet } from 'svelte';
	import { orders, type OrderSub } from '$lib/mock/orders.svelte';
	import SubNav from './SubNav.svelte';

	/** 주문 · 배송 머리 — 메뉴 안 화면 고르기(주문 목록 · 송장 일괄 입력) + 요약 한 줄 + 버튼.
	 *  PC 는 왼쪽 SubNav · 오른쪽 요약 + 버튼 한 줄(제목 없음 · 52px), 모바일은 SubNav 가 가로를 채우고 아래 요약 한 줄(MobileTop 이 메뉴 이름을 보여 준다) */
	let { value, sum, actions }: { value: OrderSub; sum: string; actions?: Snippet } = $props();
	const items = $derived(orders.subs);
</script>

<h1 class="sr-only">주문 · 배송</h1>
<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
	<SubNav {items} {value} label="주문 · 배송 화면" />
	<div class="flex items-center justify-between gap-3.5 lg:justify-end">
		<p class="min-w-0 text-[13px] text-white/60 tabular-nums lg:text-[14px]">{sum}</p>
		{#if actions}<div class="flex shrink-0 gap-2">{@render actions()}</div>{/if}
	</div>
</div>
