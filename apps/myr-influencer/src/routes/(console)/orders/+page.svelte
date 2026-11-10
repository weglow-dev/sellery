<script lang="ts">
	import { CLAIM_LABELS, SHIP_LABELS } from '@sellery/myr-core/order-view';
	import { filterSellerOrders, liveLines, SELLER_ORDER_TABS, sellerOrderAmounts, sellerOrderLabel, sellerOrderTabCounts, type SellerOrderTab } from '@sellery/myr-core/seller-orders';
	import { ORDER_EMPTY, ORDER_TONE_CLS, orderMeta, orderShipNote, orderTracking } from '$lib/orders';
	import { won } from '$lib/rules';
	import { readParam, syncParam } from '$lib/url-state';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 주문(6번 · 0081 · 읽기 전용 · 시안 없음 — CS 관리 목록 카드에 맞춤). 결제된 주문 중 내 줄만 · 고객은 가린 이름.
	 *  탭: 전체 · 배송 준비(결제 완료 · 배송 준비중) · 배송 중 · 배송 완료 · 교환·환불(진행 중 요청) · 환불(부분 포함) — 한 주문은 한 탭에만(seller-orders sellerOrderTab). 카드: 주문번호 · 상태 칩 · 결제일 · 고객 · 내 줄(상품 × 수량 · 금액 · 줄 상태) · 송장 · 진행 중 요청(→ CS 상세).
	 *  환불 버튼은 없다 — 환불은 고객 요청 → 승인(7번). 발송은 MYR 물류. 모바일: 제목 + 칩 + 한 줄 카드 / PC(lg~): 1240px · 2단 카드 */
	let { data } = $props();
	// 보던 탭은 주소(?tab=)에 — 요청 상세에 갔다가 뒤로 오면 그대로
	let tab = $state<SellerOrderTab>(readParam('tab', SELLER_ORDER_TABS.map((t) => t.id), 'all'));
	$effect(() => syncParam('tab', tab, 'all'));
	const orders = $derived(filterSellerOrders(data.orders, tab));
	const tabs = $derived(sellerOrderTabCounts(data.orders));
</script>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">주문</h1>
		<span class="text-[13px] text-white/50 lg:text-[14px]">전체 {data.orders.length}건</span>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="배송 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
			{#each orders as o (o.id)}
				{@const st = sellerOrderLabel(o)}
				{@const amt = sellerOrderAmounts(o)}
				{@const live = liveLines(o)}
				{@const mixed = new Set(live.map((i) => i.shipStatus)).size > 1}
				{@const boxes = orderTracking(o)}
				{@const note = orderShipNote(o)}
				<article class="flex flex-col gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 lg:rounded-[20px] lg:p-[18px]">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="text-[14px] font-bold lg:text-[15px]">주문 {o.code.toUpperCase()}</p>
							<p class="mt-0.5 text-[12px] text-white/50 lg:text-[13px]">{orderMeta(o)}</p>
						</div>
						<span class="shrink-0 rounded-lg px-2.5 py-[5px] text-[12px] font-bold whitespace-nowrap lg:text-[13px] {ORDER_TONE_CLS[st.tone]}">{st.text}</span>
					</div>

					<ul class="flex flex-col gap-2.5 border-t border-white/8 pt-3">
						{#each o.items as it (it.id)}
							{@const gone = it.status === 'CANCELED' || it.qty - it.refundedQty <= 0}
							<li class="flex items-center gap-3">
								<Tile tile="slate" bg={it.product?.tile} iconId={it.product?.icon} thumbUrl={it.product?.thumbUrl} icon={24} class="h-11 w-11 shrink-0 rounded-xl {gone ? 'opacity-50' : ''}" />
								<span class="flex min-w-0 flex-1 flex-col gap-0.5">
									<span class="truncate text-[14px] font-bold {gone ? 'text-white/50' : ''}">{it.name}{it.option ? ` · ${it.option}` : ''} × {it.qty}</span>
									<span class="text-[12px] text-white/50">
										{#if it.groupbuy}<span class="mr-1 rounded-[5px] bg-accent/14 px-1.5 py-px text-[11px] font-extrabold text-accent">공구</span>{/if}{won(it.amount)}{#if it.refundedQty > 0}<span class="text-[#ff8a8a]">{` · ${it.refundedQty}개 환불`}</span>{/if}{#if mixed && !gone}{` · ${SHIP_LABELS[it.shipStatus].text}`}{/if}
									</span>
								</span>
								{#if it.claim}
									<a href="/cs/{it.claim.code}" class="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[11.5px] font-bold {ORDER_TONE_CLS[CLAIM_LABELS[it.claim.status].tone]}">{it.claim.status === 'pending' ? '요청 확인' : '진행 중'}<Icon id="chev" size={12} sw={2.4} /></a>
								{/if}
							</li>
						{/each}
					</ul>

					<div class="flex flex-col gap-1.5 rounded-xl bg-white/4 px-3 py-2.5 text-[12.5px] lg:text-[13px]">
						{#if boxes.length}
							{#each boxes as b (b.text)}
								<p class="flex justify-between gap-3"><span class="shrink-0 text-white/55">운송장</span>{#if b.href}<a href={b.href} target="_blank" rel="noopener noreferrer" class="min-w-0 truncate font-semibold underline decoration-white/30 underline-offset-2 hover:text-accent">{b.text}</a>{:else}<span class="min-w-0 truncate font-semibold">{b.text}</span>{/if}</p>
							{/each}
						{:else if note}
							<p class="flex justify-between gap-3"><span class="shrink-0 text-white/55">출고</span><span class="min-w-0 text-right font-semibold">{note}</span></p>
						{/if}
						<p class="flex justify-between gap-3">
							<span class="text-white/55">내 상품 금액</span>
							<span class="font-extrabold tabular-nums">{#if amt.refunded}<span class="mr-1.5 font-semibold text-white/40 line-through">{won(amt.paid)}</span>{/if}{won(amt.net)}</span>
						</p>
					</div>
				</article>
			{:else}
				<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">{ORDER_EMPTY[tab]}</div>
			{/each}
		</div>
	</div>
</div>
