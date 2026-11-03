<script lang="ts">
	import { CS_STATUS_META, CS_TYPE_META, csTabCounts, dueText, filterCs, isUrgentPending, won, type CsTab } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 교환 · 환불 관리 — 대기 · 진행 중 · 완료(반려 포함) · 전체 필터. 들어올 때마다 "대기" 부터.
	 *  모바일은 한 줄 목록(안쪽 스크롤), PC(lg~)는 32px 제목 + 2단 카드 그리드(<main> 스크롤) */
	let tab = $state<CsTab>('pending');
	const tabs = $derived(csTabCounts(app.cs));
	const list = $derived(filterCs(app.cs, tab));
</script>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:items-baseline lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">교환 · 환불 관리</h1>
		<span class="text-[13px] text-white/50 lg:text-[14px]">대기 {app.pending.length} · 전체 {app.cs.length}</span>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="요청 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
			{#each list as c (c.id)}
				{@const tm = CS_TYPE_META[c.type]}
				{@const sm = CS_STATUS_META[c.status]}
				<a
					href="/cs/{c.id}"
					class="flex flex-col gap-2.5 rounded-[18px] border bg-white/3 p-3.5 text-left transition-colors lg:gap-3 lg:rounded-[20px] lg:p-[18px] lg:hover:border-white/30 {isUrgentPending(c) ? 'border-accent/35' : 'border-white/8'}"
				>
					<span class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-1.5"><Badge cls={tm.cls}>{tm.label}</Badge><Badge cls={sm.cls} strong={false}>{sm.label}</Badge></span>
						<span class="text-[11px] text-white/45 lg:text-[12px]">{c.no} · {c.ago}</span>
					</span>
					<span class="flex items-center gap-3 lg:gap-3.5">
						<Tile tile={c.tile} icon={26} iconCls="lg:h-9 lg:w-9" class="h-11 w-11 rounded-xl lg:h-[52px] lg:w-[52px] lg:rounded-[14px]" />
						<span class="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-[3px]">
							<span class="truncate text-[14px] font-bold lg:text-[15px]">{c.product} × {c.qty}</span>
							<span class="text-[12px] text-white/55 lg:text-[13px]">{c.customer} · {c.reason}</span>
						</span>
						<span class="text-[14px] font-extrabold whitespace-nowrap tabular-nums lg:text-[16px]">{won(c.amount)}</span>
					</span>
					{#if isUrgentPending(c)}
						<span class="flex items-center gap-1.5 text-[12px] font-bold text-accent"><Icon id="clock" size={14} sw={2.2} />{dueText(c)}</span>
					{/if}
				</a>
			{:else}
				<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">해당하는 요청이 없어요</div>
			{/each}
		</div>
	</div>
</div>
