<script lang="ts">
	/** 주문 상세 — 회원(/orders/[code]) · 비회원(/orders/g/[code]) 공용 · 화면 전체(머리 포함)를 그린다(대표 시안 2026-11-02).
	 *  PC: 제목 + 오른쪽 상태 칩·주문번호·시각·결제수단 / 왼쪽 상품 카드(크리에이터 · 이름 · 수량·금액 · [문의]) / 오른쪽 결제 정보 + [교환 · 환불 신청] · 배송지(+이메일).
	 *  모바일: 뒤로 헤더(주문번호) · 칩 줄 · 상품 카드 · 결제 · 배송지 · 하단 바 [교환 · 환불 신청](앱 셸 바닥 — fixed 를 쓰지 않는다, +layout.svelte 주석).
	 *  [문의] = 상품 페이지와 같은 CsSheet(이 주문 고정 · 비회원도 주문 조회 토큰으로). [교환 · 환불 신청] = RefundPanel 을 결제 카드 안에서 연다. */
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { won } from '$lib/data';
	import { csStatusChip, relTime, type CsForOrder, type CsOrderOption } from '$lib/cs-rules';
	import { displayCode, shortDate, statusLabel, type OrderItem, type OrderView } from '$lib/order-view';
	import { customerCanRefund } from '$lib/refund-rules';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import CsSheet from '$lib/components/CsSheet.svelte';
	import RefundPanel from '$lib/components/RefundPanel.svelte';
	import Tile from '$lib/components/Tile.svelte';

	let { order, inquiries = [], guestNote = false }: { order: OrderView; inquiries?: CsForOrder[]; guestNote?: boolean } = $props();
	const label = $derived(statusLabel(order));
	const can = $derived(customerCanRefund(order));
	const deposit = $derived(can.ok && can.deposit);
	const tone: Record<string, string> = { accent: 'bg-accent/12 text-accent', muted: 'bg-white/8 text-white/55', danger: 'bg-[#ff6b6b]/12 text-[#ff6b6b]', ok: 'bg-[#4ade80]/12 text-[#4ade80]' };
	const dueText = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
	const lineStatus = (s: string, refunded: number, qty: number) => (s === 'REFUNDED' ? '환불 완료' : s === 'PARTIAL_REFUNDED' ? `${refunded}/${qty} 환불` : s === 'CANCELED' ? '취소' : '');
	const meta = $derived([relTime(order.paidAt ?? order.createdAt), order.paymentMethod].filter(Boolean).join(' · '));

	// 문의 시트 — 누른 줄의 상품 + 이 주문 고정
	let csOpen = $state(false);
	let csItem = $state<OrderItem | null>(null);
	const preset = $derived<CsOrderOption>({ code: order.code, label: `${displayCode(order.code)} · ${shortDate(order.createdAt)}` });
	function ask(it: OrderItem) {
		csItem = it;
		csOpen = true;
	}

	// 환불 패널 — 결제 카드 안 · 모바일 하단 바에서 열면 그 자리로 스크롤
	let refundOpen = $state(false);
	let payCard = $state<HTMLElement | null>(null);
	async function openRefund() {
		refundOpen = true;
		await tick();
		payCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	const actionLabel = $derived(deposit ? '주문 취소' : '교환 · 환불 신청');
	const chipTone: Record<string, string> = { accent: 'bg-accent/12 text-accent', ok: 'bg-[#4ade80]/12 text-[#4ade80]', muted: 'bg-white/8 text-white/55' };
	const askIcon = 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20.5l1.6-4.6A8.3 8.3 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z';
</script>

<div class="flex h-full flex-col lg:mx-auto lg:block lg:h-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain lg:overflow-visible">
		<BackHeader title="주문 상세">
			{#snippet right()}<span class="font-mono text-[13px] text-fg-faint">{displayCode(order.code)}</span>{/snippet}
		</BackHeader>

		<!-- 머리: PC 는 제목 오른쪽, 모바일은 칩 줄 -->
		<div class="hidden items-center justify-between lg:flex">
			<h1 class="text-[32px] font-extrabold tracking-[-.03em]">주문 상세</h1>
			<p class="flex items-center gap-3 text-[13px] text-fg-faint">
				<span class="rounded-[8px] px-2.5 py-[5px] text-[12.5px] font-bold {tone[label.tone]}">{label.text}</span>
				<span><span class="font-mono">{displayCode(order.code)}</span>{meta ? ` · ${meta}` : ''}</span>
			</p>
		</div>
		<div class="flex items-center justify-between px-5 pt-1 pb-3 lg:hidden">
			<span class="rounded-[8px] px-2.5 py-[5px] text-[12.5px] font-bold {tone[label.tone]}">{label.text}</span>
			<span class="text-[12.5px] text-fg-faint">{meta}</span>
		</div>

		{#if guestNote}
			<p class="mx-5 mb-3 rounded-[14px] border border-white/8 bg-white/3 px-4 py-3 text-[13px] leading-[1.5] text-white/70 lg:mx-0 lg:mt-5 lg:mb-0">비회원 주문이에요 — 이 기기에서 90일 동안 바로 열리고, 다른 기기에서는 <a href="/orders/lookup" class="font-bold text-accent">주문 조회</a>에서 주문번호와 연락처로 열 수 있어요.</p>
		{/if}
		<div class="flex flex-col gap-3 px-5 pb-6 lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-0 lg:pb-0">
			<!-- 왼쪽: 입금 안내 · 배송 · 상품 -->
			<div class="flex flex-col gap-3">
				{#if order.status === 'WAITING_DEPOSIT' && order.deposit}
					<div class="rounded-[18px] border border-accent/30 bg-accent/8 px-4 py-3.5 lg:rounded-[20px] lg:px-5 lg:py-4">
						<p class="text-[12.5px] font-bold text-accent">가상계좌 입금 안내</p>
						<p class="mt-1 text-[15px] font-bold">{order.deposit.bank} {order.deposit.account}</p>
						{#if order.deposit.holder}<p class="text-[13px] text-white/70">예금주 {order.deposit.holder}</p>{/if}
						<p class="mt-1 text-[13px] text-white/70">입금 금액 <b class="text-fg">{won(order.amount)}</b>{#if order.deposit.due} · 기한 {dueText(order.deposit.due)}{/if}</p>
					</div>
				{/if}
				{#if order.trackingNo}
					<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-[13px] text-white/80 lg:rounded-[20px] lg:px-5">
						{order.courier ?? '택배'} <span class="font-mono">{order.trackingNo}</span>{#if order.shippedAt} · {shortDate(order.shippedAt)} 발송{/if}
					</div>
				{/if}
				{#each order.items as it (it.id)}
					{@const ls = lineStatus(it.status, it.refundedQty, it.qty)}
					<div class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 lg:gap-4 lg:rounded-[20px] lg:p-4">
						<a href="/p/{it.code}" aria-label={it.name} class="shrink-0"><Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt={it.name} icon={26} class="h-14 w-14 rounded-[14px] lg:h-20 lg:w-20 lg:rounded-2xl" /></a>
						<div class="min-w-0 flex-1">
							{#if it.creator}<p class="hidden text-[12px] font-bold text-accent lg:block">{it.creator}</p>{/if}
							<p class="truncate text-[14.5px] font-bold lg:mt-0.5 lg:text-[16px]">{it.name}{#if it.option} · {it.option}{/if}</p>
							<p class="mt-0.5 text-[12.5px] text-fg-faint lg:mt-1 lg:text-[13px]">{it.qty}개 · {won(it.amount)}{#if ls} · <span class="text-white/55">{ls}</span>{/if}</p>
						</div>
						<button type="button" onclick={() => ask(it)} class="flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] border border-white/16 px-3 text-[13px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={askIcon} /></svg>문의
						</button>
					</div>
				{/each}
			</div>

			<!-- 오른쪽: 결제 정보 · 배송지 · 이 주문의 문의 -->
			<div class="flex flex-col gap-3 lg:sticky lg:top-[104px]">
				<section bind:this={payCard} class="scroll-mt-4 rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-6 lg:py-6">
					<h2 class="mb-3.5 hidden text-[16px] font-extrabold lg:block">결제 정보</h2>
					<div class="flex flex-col gap-2 text-[14px]">
						<div class="flex justify-between text-fg-soft"><span>{order.shippingFee ? '상품 금액' : '결제 금액'}</span><span class="text-fg">{won(order.itemsAmount)}</span></div>
						{#if order.shippingFee}<div class="flex justify-between text-fg-soft"><span>배송비</span><span class="text-fg">{won(order.shippingFee)}</span></div>{/if}
					</div>
					<div class="mt-3.5 flex items-baseline justify-between border-t border-white/8 pt-3.5">
						<span class="text-[14px] font-bold">{order.status === 'WAITING_DEPOSIT' ? '입금할 금액' : '최종 결제'}</span>
						<span class="text-[22px] font-extrabold tracking-[-.02em] lg:text-[24px]">{won(order.amount)}</span>
					</div>
					{#if order.refundAmount}
						<div class="mt-1.5 flex justify-between text-[13.5px]"><span class="text-fg-soft">환불</span><span class="font-bold text-[#ff6b6b]">−{won(order.refundAmount)}</span></div>
					{/if}
					{#if can.ok && !refundOpen}
						<button type="button" onclick={openRefund} class="mt-5 hidden h-14 w-full rounded-[16px] border border-white/16 text-[15px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4 lg:block">{actionLabel}</button>
					{/if}
					<RefundPanel {order} bind:open={refundOpen} showTrigger={false} />
				</section>

				{#if order.shipping}
					<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-5 lg:py-5">
						<p class="text-[13px] text-fg-faint">배송지</p>
						<p class="mt-2 text-[15px] font-bold">{order.shipping.recipient} <span class="ml-1.5 font-normal text-white/75">{order.shipping.phone}</span></p>
						<p class="mt-1 text-[14px] text-white/80">{#if order.shipping.postcode}({order.shipping.postcode}) {/if}{order.shipping.address1} {order.shipping.address2}</p>
						{#if order.shipping.memo}<p class="mt-1 text-[13px] text-fg-faint">메모: {order.shipping.memo}</p>{/if}
						{#if order.buyerEmail}
							<p class="mt-3.5 flex items-center gap-2.5 border-t border-white/8 pt-3.5 text-[13.5px] text-white/80">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>{order.buyerEmail}
							</p>
						{/if}
					</section>
				{/if}

				{#if inquiries.length}
					<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-5">
						<p class="text-[13px] text-fg-faint">이 주문의 문의</p>
						<div class="mt-2 flex flex-col gap-1.5">
							{#each inquiries as q (q.code)}
								{@const chip = csStatusChip(q.status)}
								<a href="/cs/{q.code}" class="flex items-center justify-between gap-2 rounded-[12px] bg-white/4 px-3 py-2.5 text-fg transition-colors hover:bg-white/7">
									<span class="min-w-0"><span class="block truncate text-[13px] font-bold">{q.productName}</span><span class="block text-[11.5px] text-fg-faint">{q.type} · {relTime(q.lastMessageAt)}</span></span>
									<span class="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-bold {chipTone[chip.tone]}">{chip.label}</span>
								</a>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		</div>
	</div>

	<!-- 모바일 하단 바 -->
	{#if can.ok && !refundOpen}
		<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden">
			<button type="button" onclick={openRefund} class="h-14 w-full rounded-[16px] border border-white/16 text-[15px] font-bold text-fg">{actionLabel}</button>
		</div>
	{/if}
</div>

{#if csItem}
	<CsSheet
		bind:open={csOpen}
		product={{ code: csItem.code, name: csItem.name, tile: csItem.tile, ic: csItem.ic, thumbUrl: csItem.thumbUrl }}
		creator={{ name: csItem.creator || '크리에이터', handle: csItem.creatorHandle }}
		{preset}
		onSent={() => invalidateAll()}
	/>
{/if}
