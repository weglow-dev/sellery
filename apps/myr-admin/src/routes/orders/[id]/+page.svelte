<script lang="ts">
	import { page } from '$app/state';
	import { orders } from '$lib/mock/orders.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InfoRow from '$lib/components/InfoRow.svelte';
	import MaskValue from '$lib/components/MaskValue.svelte';
	import OrderModals, { orderModal } from '$lib/components/OrderModals.svelte';
	import PanelBtn from '$lib/components/PanelBtn.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 주문 상세 — docs/myr-admin-screens.md §6-2 (시안 "MYR Admin PC" · "MYR Admin" 주문 상세 · 2026-11-26 — 서랍 대신 전체 화면).
	 *  머리(뒤로 · 주문번호 · 상태 · 이벗 발주 실패 · 배송 완료 예외 칩) · 왼쪽 주문 줄 · 수취인 · 결제 · 처리 이력
	 *  / 오른쪽 고정 패널(송장 — 발주 실패 · 배송 완료 예외면 빨간 안내 상자 · [송장 입력] 또는 [송장 정정] [배송 완료] · [예외 환불]).
	 *  모바일: 머리 아래 칩 → 송장 → 버튼 → 본문 → 맨 아래 "관리" 칸(예외 환불). 칩 · 안내 · 버튼은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(orders.view(id));
	const has = (a: string) => !!v?.actions.includes(a as never);
	const COLS = 'grid-cols-[minmax(0,1fr)_50px_96px] lg:grid-cols-[minmax(0,1fr)_50px_96px]';
</script>

{#snippet shipBody()}
	{#if v}
		{#if v.ebutFail || v.overdue}
			<div class="mb-2.5 rounded-[14px] bg-danger/10 px-4 pt-3.5 pb-2">
				{#if v.ebutFail}
					{#each v.ebutFail.lines as l (l)}
						<p class="flex gap-2 py-0.5 text-[13.5px] leading-[1.6] font-semibold text-danger-fg"><span class="shrink-0" aria-hidden="true">•</span><span>{l}</span></p>
					{/each}
					{#each v.ebutFail.codes as c (c.code)}
						<div class="flex min-h-9 items-center gap-2.5">
							<span class="min-w-0 flex-1 truncate text-[14px] text-white/75">{c.name}</span>
							<span class="shrink-0 text-[14px] font-bold tabular-nums">{c.code}</span>
							<CopyButton text={c.code} what="상품코드" />
						</div>
					{/each}
				{:else if v.overdue}
					<p class="pb-1.5 text-[13.5px] leading-[1.55] font-semibold text-danger-fg">{v.overdue.title}</p>
					{#each v.overdue.cases as l (l)}
						<p class="flex gap-2 py-px pl-0.5 text-[13.5px] leading-[1.6] text-white/82"><span class="shrink-0 text-danger-fg" aria-hidden="true">•</span><span>{l}</span></p>
					{/each}
					<p class="pt-2 pb-1.5 text-[13.5px] leading-[1.55] font-semibold text-white/82">{v.overdue.foot}</p>
				{/if}
			</div>
		{/if}
		<div class={v.ebutFail || v.overdue ? 'rounded-[14px] border border-white/10 px-4 py-1.5' : ''}>
			{#if v.ship}
				<InfoRow k="택배사">{v.ship.carrier}</InfoRow>
				<InfoRow k="운송장">{v.ship.tracking}</InfoRow>
				<InfoRow k="발송">{v.ship.shippedText}</InfoRow>
				<InfoRow k="배송 완료" tone={v.ship.doneTone === 'red' ? 'red' : 'plain'}>{v.ship.done}</InfoRow>
			{:else}
				<InfoRow k="송장" tone={v.noShip.tone === 'orange' ? 'orange' : 'plain'}>{v.noShip.text}</InfoRow>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet topBtns()}
	{#if v}
		{#if has('ship')}<div class="flex gap-2"><PanelBtn tone="primary" onclick={() => orderModal.show('ship', v.id)}>송장 입력</PanelBtn></div>{/if}
		{#if has('fixShip') || has('delivered')}
			<div class="flex gap-2">
				{#if has('fixShip')}<PanelBtn onclick={() => orderModal.show('ship', v.id)}>송장 정정</PanelBtn>{/if}
				{#if has('delivered')}<PanelBtn tone="primary" onclick={() => orderModal.show('delivered', v.id)}>배송 완료</PanelBtn>{/if}
			</div>
		{/if}
	{/if}
{/snippet}

{#if !v}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">주문을 찾을 수 없어요</p>
		<a href="/orders" class="mt-3 inline-block text-[14px] font-bold text-accent">주문 목록으로</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<!-- 머리 -->
		<div class="flex flex-wrap items-center gap-x-3 gap-y-3 lg:min-h-[52px] lg:flex-nowrap lg:gap-x-3.5">
			<a href="/orders" aria-label="주문 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
			<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em] tabular-nums lg:text-[28px]">{v.id}</h1>
			<div class="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0 lg:gap-2">
				{#each v.headChips as c (c.label)}<Chip label={c.label} tone={c.tone} md />{/each}
			</div>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3 lg:gap-3.5">
				<!-- 모바일 — 송장 · 버튼이 위 -->
				<div class="flex flex-col gap-3 lg:hidden">
					<DetailCard title="송장">{@render shipBody()}</DetailCard>
					{@render topBtns()}
				</div>

				<DetailCard title="주문 줄">
					<div class="grid {COLS} items-end gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] font-semibold text-white/45">
						<span>상품</span><span class="text-right">수량</span><span class="text-right">금액</span>
					</div>
					{#each v.lines as l (l.productId)}
						<div class="grid {COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] tabular-nums">
							<span class="truncate font-[650]">{l.name}</span>
							<span class="text-right">{l.qtyText}</span>
							<span class="text-right">{l.amountText}</span>
						</div>
					{/each}
				</DetailCard>

				<DetailCard title="수취인 · 결제">
					{#each v.recipient as r (r.k)}
						<InfoRow k={r.k}><MaskValue masked={r.masked} raw={r.raw} what={r.k} /></InfoRow>
					{/each}
					<InfoRow k="결제">{v.payment}</InfoRow>
					<InfoRow k="크리에이터"><a href="/creators/{v.creator.id}" class="underline-offset-2 hover:underline">{v.creator.name} {v.creator.handle}</a></InfoRow>
					{#if v.note}<InfoRow k="메모">{v.note}</InfoRow>{/if}
				</DetailCard>

				{#if v.log.length}
					<DetailCard title="처리 이력"><Timeline items={v.log} oldFirst who={false} /></DetailCard>
				{/if}

				<!-- 모바일 "관리" 칸 — 예외 환불은 맨 아래 -->
				{#if has('refund')}
					<div class="mt-2 flex flex-col gap-2 border-t border-white/8 pt-[18px] lg:hidden">
						<p class="text-[12.5px] font-bold text-white/45">관리</p>
						<div class="flex gap-2"><PanelBtn sm tone="danger" onclick={() => orderModal.show('refund', v.id)}>예외 환불</PanelBtn></div>
					</div>
				{/if}
			</div>

			<!-- 오른쪽 고정 패널(PC) -->
			<aside class="sticky top-7 hidden flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-6 lg:flex">
				<DetailCard title="송장" plain>{@render shipBody()}</DetailCard>
				<div class="flex flex-col gap-2.5">
					{@render topBtns()}
					{#if has('refund')}<div class="flex gap-2"><PanelBtn tone="danger" onclick={() => orderModal.show('refund', v.id)}>예외 환불</PanelBtn></div>{/if}
				</div>
			</aside>
		</div>
	</div>
	<OrderModals />
{/if}
