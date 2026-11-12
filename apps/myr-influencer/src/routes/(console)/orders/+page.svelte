<script lang="ts">
	import { filterSellerOrders, SELLER_ORDER_TABS, sellerOrderTabCounts, type SellerOrderLine, type SellerOrderTab } from '@sellery/myr-core/seller-orders';
	import { ORDER_EMPTY, orderChip, orderClaimCode, orderLineState, orderMeta, orderShipLine } from '$lib/orders';
	import { won } from '$lib/rules';
	import { readParam, syncParam } from '$lib/url-state';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 주문(6번 · 0081 · 읽기 전용 · 카드는 시안 "MYR Influencer Admin" · "… PC" 주문 탭). 결제된 주문 중 내 줄만 · 고객은 가린 이름.
	 *  탭: 전체 · 배송 준비(결제 완료 · 배송 준비중) · 배송 중 · 배송 완료 · 교환·환불(진행 중 요청) · 환불(부분 포함) — 한 주문은 한 탭에만(seller-orders sellerOrderTab). 카드: 주문번호 · 결제일 · 고객 · 상태 칩 / 첫 상품 줄(상품 × 수량 · 금액 · 줄 상태) + [외 N개] 펼침 + [진행 중](→ 요청 상세) / 배송 줄(발주 전 · 준비 중 · 송장 · 배송 완료일) + 내 상품 금액.
	 *  환불 버튼은 없다 — 환불은 고객 요청 → 승인(7번). 발송은 MYR 물류. 모바일: 제목 + 칩 + 한 줄 카드 / PC(lg~): 1240px · 2단 카드 */
	let { data } = $props();
	// 보던 탭은 주소(?tab=)에 — 요청 상세에 갔다가 뒤로 오면 그대로
	let tab = $state<SellerOrderTab>(readParam('tab', SELLER_ORDER_TABS.map((t) => t.id), 'all'));
	$effect(() => syncParam('tab', tab, 'all'));
	const orders = $derived(filterSellerOrders(data.orders, tab));
	const tabs = $derived(sellerOrderTabCounts(data.orders));

	// [외 N개] 펼친 주문 — 한 번에 하나 · 바깥을 누르거나 Esc 로 닫는다
	let openCode = $state<string | null>(null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (openCode = null)} />

{#snippet line(it: SellerOrderLine, tileCls: string, big: boolean)}
	{@const ls = orderLineState(it)}
	<Tile tile="slate" bg={it.product?.tile} iconId={it.product?.icon} thumbUrl={it.product?.thumbUrl} icon={24} class="shrink-0 {tileCls} {it.live ? '' : 'opacity-50'}" />
	<span class="flex min-w-0 flex-1 flex-col gap-0.5 {big ? 'lg:gap-[3px]' : ''}">
		<span class="truncate text-[14px] font-bold {big ? 'lg:text-[15px]' : ''} {it.live ? '' : 'text-white/50'}">{it.name}{it.option ? ` · ${it.option}` : ''} × {it.qty}</span>
		<span class="truncate text-[12px] text-white/55 tabular-nums {big ? 'lg:text-[13px]' : ''}">
			{#if it.groupbuy}<span class="mr-1 rounded-[5px] bg-accent/14 px-1.5 py-px text-[11px] font-extrabold text-accent">공구</span>{/if}{won(it.amount)} · <span class={ls.alert ? 'text-[#ff8a8a]' : ''}>{ls.text}</span>
		</span>
	</span>
{/snippet}

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">주문</h1>
		<span class="text-[13px] text-white/50 lg:text-[14px]">전체 {data.orders.length}건</span>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="배송 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
			{#each orders as o (o.id)}
				{@const chip = orderChip(o)}
				{@const amt = o.amounts}
				{@const first = o.items[0]}
				{@const rest = o.items.slice(1)}
				{@const claimCode = orderClaimCode(o)}
				{@const shipLine = orderShipLine(o)}
				{@const isOpen = openCode === o.code}
				<article class="relative flex flex-col gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 lg:gap-3.5 lg:rounded-[20px] lg:p-[18px]">
					<div class="flex items-start justify-between gap-2.5">
						<div class="min-w-0">
							<p class="text-[14px] font-extrabold lg:text-[15px]">주문 {o.code.toUpperCase()}</p>
							<p class="mt-[3px] text-[12px] text-white/50">{orderMeta(o)}</p>
						</div>
						<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11px] font-bold whitespace-nowrap lg:rounded-lg lg:px-2.5 lg:py-[5px] lg:text-[12px] {chip.cls}">{chip.text}</span>
					</div>

					<!-- 첫 상품 줄 · 나머지는 [외 N개] 펼침 · 진행 중인 요청이 있으면 [진행 중] → 요청 상세 -->
					<div class="relative flex items-center gap-3 border-t border-white/6 pt-3 lg:gap-3.5 lg:pt-3.5">
						{@render line(first, 'h-11 w-11 rounded-xl lg:h-[52px] lg:w-[52px] lg:rounded-[14px]', true)}
						{#if rest.length}
							<button
								type="button"
								onclick={() => (openCode = isOpen ? null : o.code)}
								aria-expanded={isOpen}
								class="relative z-[11] flex h-[30px] shrink-0 items-center gap-[3px] rounded-full border pr-2 pl-3 text-[12px] font-bold transition-colors lg:h-[34px] {isOpen ? 'border-accent' : 'border-white/14'}"
							>
								외 {rest.length}개<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-transform {isOpen ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
							</button>
						{/if}
						{#if claimCode}
							<a href="/cs/{claimCode}" class="flex h-[30px] shrink-0 items-center gap-0.5 rounded-full bg-[#ff6b6b]/14 pr-2 pl-3 text-[12px] font-bold text-[#ff8a8a] lg:h-[34px]">진행 중<Icon id="chev" size={13} sw={2.6} /></a>
						{/if}
						{#if isOpen}
							<button type="button" aria-label="닫기" onclick={() => (openCode = null)} class="fixed inset-0 z-[9] cursor-default"></button>
							<ul class="absolute top-[calc(100%+8px)] right-0 left-0 z-10 flex animate-up-in flex-col rounded-2xl border border-white/12 bg-panel-2 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
								{#each rest as it (it.id)}
									<li class="flex items-center gap-3 px-2.5 py-2">{@render line(it, 'h-10 w-10 rounded-xl', false)}</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2.5 lg:rounded-[14px] lg:px-3.5 lg:py-3">
						<span class="flex min-w-0 items-center gap-1.5 text-[12px] text-white/60">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0"><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>
							{#if shipLine.href}<a href={shipLine.href} target="_blank" rel="noopener noreferrer" class="min-w-0 truncate underline decoration-white/30 underline-offset-2 hover:text-accent">{shipLine.text}</a>{:else}<span class="min-w-0 truncate">{shipLine.text}</span>{/if}
						</span>
						<span class="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
							<span class="text-[11px] text-white/45">내 상품 금액</span>
							{#if amt.refunded}<span class="text-[12px] text-white/40 tabular-nums line-through">{won(amt.paid)}</span>{/if}
							<span class="text-[14px] font-extrabold tabular-nums lg:text-[15px]">{won(amt.net)}</span>
						</span>
					</div>
				</article>
			{:else}
				<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">{ORDER_EMPTY[tab]}</div>
			{/each}
		</div>
	</div>
</div>
