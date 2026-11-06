<script lang="ts">
	/** 주문 상세 — 회원(/orders/[code]) · 비회원(/orders/g/[code]) 공용 · 화면 전체(머리 포함)를 그린다(대표 시안 2026-11-02).
	 *  PC: 제목 + 오른쪽 상태 칩·주문번호·시각·결제수단 / 왼쪽 상품 카드(크리에이터 · 이름 · 수량·금액 · [문의]) / 오른쪽 결제 정보 + [교환 · 환불 신청] · 배송지(+이메일).
	 *  모바일: 뒤로 헤더(주문번호) · 칩 줄 · 상품 카드 · 결제 · 배송지 · 하단 바 [교환 · 환불 신청](앱 셸 바닥 — fixed 를 쓰지 않는다, +layout.svelte 주석).
	 *  [문의] = 상품 페이지와 같은 CsSheet(이 주문 고정 · 비회원도 주문 조회 토큰으로). [교환 · 환불 신청] = 환불 신청 페이지(/orders/[code]/refund · 비회원 /orders/g/[code]/refund · RefundPage)로. */
	import { invalidateAll } from '$app/navigation';
	import { won } from '$lib/data';
	import { csStatusChip, relTime, type CsForOrder, type CsOrderOption } from '@sellery/myr-core/cs-rules';
	import { displayCode, refundSteps, SHIP_LABELS, shipBoxes, shortDate, statusLabel, type OrderItem, type OrderView } from '@sellery/myr-core/order-view';
	import { customerCanRefund } from '@sellery/myr-core/refund-rules';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import CsSheet from '$lib/components/CsSheet.svelte';
	import Tile from '$lib/components/Tile.svelte';

	let { order, inquiries = [], guestNote = false }: { order: OrderView; inquiries?: CsForOrder[]; guestNote?: boolean } = $props();
	const label = $derived(statusLabel(order));
	const can = $derived(customerCanRefund(order));
	const deposit = $derived(can.ok && can.deposit);
	const tone: Record<string, string> = { accent: 'bg-accent/12 text-accent', muted: 'bg-white/8 text-white/55', danger: 'bg-[#ff6b6b]/12 text-[#ff6b6b]', ok: 'bg-[#4ade80]/12 text-[#4ade80]' };
	const dueText = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
	const lineStatus = (s: string, refunded: number, qty: number) => (s === 'REFUNDED' ? '환불 완료' : s === 'PARTIAL_REFUNDED' ? `${refunded}/${qty} 환불` : s === 'CANCELED' ? '취소' : '');
	// 줄마다 배송 상태가 다르면(일부만 출고 등 · 0077) 줄 옆에 그 줄의 배송 상태를 보여 준다
	const liveItems = $derived(order.items.filter((i) => i.status !== 'CANCELED' && i.qty - i.refundedQty > 0));
	const mixedShip = $derived(new Set(liveItems.map((i) => i.shipStatus)).size > 1);
	const ship = $derived(shipBoxes(order.items));
	const steps = $derived(refundSteps(order));
	const meta = $derived([relTime(order.paidAt ?? order.createdAt), order.paymentMethod].filter(Boolean).join(' · '));

	// 문의 시트 — 누른 줄의 상품 + 이 주문 고정
	let csOpen = $state(false);
	let csItem = $state<OrderItem | null>(null);
	const preset = $derived<CsOrderOption>({ code: order.code, label: `${displayCode(order.code)} · ${shortDate(order.createdAt)}` });
	function ask(it: OrderItem) {
		csItem = it;
		csOpen = true;
	}

	// 환불 신청은 별도 페이지(대표 시안 2026-11-03) — 비회원은 조회 토큰 경로
	const refundHref = $derived(guestNote ? `/orders/g/${order.code}/refund` : `/orders/${order.code}/refund`);
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
				{#if ship.boxes.length}
					<!-- 송장 — 한 박스면 한 줄, 박스가 나뉘었거나 아직 안 나간 상품이 있으면 박스마다 담긴 상품 -->
					<div class="flex flex-col gap-2.5 rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-[13px] text-white/80 lg:rounded-[20px] lg:px-5">
						{#each ship.boxes as b (b.courier + b.trackingNo)}
							<div>
								<p>{b.courier ?? '택배'} <span class="font-mono">{b.trackingNo}</span>{b.shippedAt ? ` · ${shortDate(b.shippedAt)} 발송` : ''}</p>
								{#if !ship.single}<p class="mt-0.5 truncate text-[12px] text-fg-faint">{b.names.join(' · ')}</p>{/if}
							</div>
						{/each}
					</div>
				{:else if order.trackingNo}
					<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-[13px] text-white/80 lg:rounded-[20px] lg:px-5">
						{order.courier ?? '택배'} <span class="font-mono">{order.trackingNo}</span>{order.shippedAt ? ` · ${shortDate(order.shippedAt)} 발송` : ''}
					</div>
				{/if}
				{#each order.items as it (it.id)}
					{@const ls = lineStatus(it.status, it.refundedQty, it.qty) || (mixedShip && order.status !== 'WAITING_DEPOSIT' ? SHIP_LABELS[it.shipStatus].text : '')}
					<div class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 lg:gap-4 lg:rounded-[20px] lg:p-4">
						<a href="/p/{it.code}" aria-label={it.name} class="shrink-0"><Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt={it.name} icon={26} class="h-14 w-14 rounded-[14px] lg:h-20 lg:w-20 lg:rounded-2xl" /></a>
						<div class="min-w-0 flex-1">
							{#if it.creator}<p class="hidden text-[12px] font-bold text-accent lg:block">{it.creator}</p>{/if}
							<p class="truncate text-[14.5px] font-bold lg:mt-0.5 lg:text-[16px]">{it.name}{#if it.option} · {it.option}{/if}</p>
							<p class="mt-0.5 text-[12.5px] text-fg-faint lg:mt-1 lg:text-[13px]">{it.qty}개 · {won(it.amount)}{#if ls}<span class="text-white/55 lg:hidden">{` · ${ls}`}</span>{/if}</p>
						</div>
						{#if ls}<span class="hidden shrink-0 rounded-[8px] bg-[#6b7bd6]/18 px-2.5 py-[5px] text-[12.5px] font-bold text-[#aab4f5] lg:inline-block">{ls}</span>{/if}
						<button type="button" onclick={() => ask(it)} class="flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] border border-white/16 px-3 text-[13px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={askIcon} /></svg>문의
						</button>
					</div>
				{/each}

				<!-- 환불 진행 상태 — 실제 기록만(신청 사유 · 완료 시각). 환불은 신청 즉시 토스 취소까지 끝나서 "판매자 확인" 대기 단계는 없다 -->
				{#if steps}
					<section aria-label="환불 진행 상태" class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-6 lg:py-6">
						<h2 class="text-[15px] font-extrabold lg:text-[16px]">환불 진행 상태</h2>
						<ol class="mt-4 flex flex-col">
							{#each steps as st, i (st.title)}
								<li class="relative flex gap-3 {i < steps.length - 1 ? 'pb-5' : ''}">
									{#if i < steps.length - 1}<span aria-hidden="true" class="absolute top-6 bottom-0 left-[11px] w-px bg-white/14"></span>{/if}
									<span class="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full {st.done ? 'bg-accent text-bg' : 'border border-white/20'}">
										{#if st.done}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
									</span>
									<div class="min-w-0">
										<p class="text-[14.5px] font-bold">{st.title}{#if st.at}<span class="ml-2 text-[12px] font-normal text-fg-faint">{relTime(st.at)}</span>{/if}</p>
										<p class="mt-0.5 text-[12.5px] leading-[1.5] text-fg-faint">{st.detail}</p>
									</div>
								</li>
							{/each}
						</ol>
					</section>
				{/if}
			</div>

			<!-- 오른쪽: 결제 정보 · 배송지 · 이 주문의 문의 -->
			<div class="flex flex-col gap-3 lg:sticky lg:top-[104px]">
				<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-6 lg:py-6">
					<h2 class="mb-3.5 hidden text-[16px] font-extrabold lg:block">결제 정보</h2>
					<div class="flex flex-col gap-2 text-[14px]">
						{#if order.refundAmount}
							<!-- 환불이 있으면: 결제 금액 · 환불 금액 → 최종 결제(= 결제 − 환불) -->
							<div class="flex justify-between text-fg-soft"><span>결제 금액</span><span class="text-fg">{won(order.amount)}</span></div>
							<div class="flex justify-between text-fg-soft"><span>환불 금액</span><span class="font-bold text-accent">−{won(order.refundAmount)}</span></div>
						{:else}
							<div class="flex justify-between text-fg-soft"><span>{order.shippingFee ? '상품 금액' : '결제 금액'}</span><span class="text-fg">{won(order.itemsAmount)}</span></div>
							{#if order.shippingFee}<div class="flex justify-between text-fg-soft"><span>배송비</span><span class="text-fg">{won(order.shippingFee)}</span></div>{/if}
						{/if}
					</div>
					<div class="mt-3.5 flex items-baseline justify-between border-t border-white/8 pt-3.5">
						<span class="text-[14px] font-bold">{order.status === 'WAITING_DEPOSIT' ? '입금할 금액' : '최종 결제'}</span>
						<span class="text-[22px] font-extrabold tracking-[-.02em] lg:text-[24px]">{won(Math.max(0, order.amount - order.refundAmount))}</span>
					</div>
					{#if can.ok}
						<a href={refundHref} class="mt-5 hidden h-14 w-full items-center justify-center rounded-[16px] border border-white/16 text-[15px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4 lg:flex">{actionLabel}</a>
					{:else if order.status !== 'REFUNDED' && order.status !== 'CANCELED'}
						<p class="mt-3 text-[12px] leading-[1.55] text-fg-faint">{can.reason}</p>
					{/if}
				</section>

				{#if order.shipping}
					<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-5 lg:py-5">
						<p class="text-[13px] text-fg-faint">배송지</p>
						<p class="mt-2 text-[15px] font-bold">{order.shipping.recipient} <span class="ml-1.5 font-normal text-white/75">{order.shipping.phone}</span></p>
						<p class="mt-1 text-[14px] text-white/80">{#if order.shipping.postcode}({order.shipping.postcode}) {/if}{order.shipping.address1} {order.shipping.address2}</p>
						{#if order.shipping.memo}<p class="mt-1 text-[13px] text-fg-faint">메모: {order.shipping.memo}</p>{/if}
						<!-- 이메일 줄은 항상 — 주문 때 이메일을 안 받았으면(카카오 계정 · 비회원 미입력) '-' -->
						<p class="mt-3.5 flex items-center gap-2.5 border-t border-white/8 pt-3.5 text-[13.5px] {order.buyerEmail ? 'text-white/80' : 'text-fg-faint'}">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg><span aria-label={order.buyerEmail ? undefined : '이메일 없음'}>{order.buyerEmail || '-'}</span>
						</p>
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
	{#if can.ok}
		<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden">
			<a href={refundHref} class="flex h-14 w-full items-center justify-center rounded-[16px] border border-white/16 text-[15px] font-bold text-fg">{actionLabel}</a>
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
