<script lang="ts">
	import { INQ_EMPTY, INQ_TABS, filterInquiries, inqStatus, inqTabCounts, inqTypeCls, isWaiting, type InqTab } from '$lib/inquiry';
	import { relativeTime } from '$lib/product-row';
	import { CS_STATUS_META, CS_TABS, CS_TYPE_META, claimTabCounts, dueText, filterClaims, isUrgentPending, type CsTab } from '$lib/claims';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { readParam, syncParam } from '$lib/url-state';
	import Badge from '$lib/components/Badge.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** CS 관리 — [교환 · 환불 | 고객 문의] (시안 "MYR Influencer Admin" · "… PC" csSeg).
	 *  교환 · 환불: 대기 · 진행 중 · 완료 · 전체 — 서버(0078 · +page.server.ts). 고객 문의: 답변 대기 · 답변 완료 · 전체 — 서버(0075).
	 *  보던 쪽 · 탭은 주소(?view=inquiry · ?tab= · ?inq=)에 남겨 상세에서 뒤로 오면 그대로(`$lib/url-state`). 모바일: "CS 관리" 제목 + 전체 폭 전환 / PC(lg~): 왼쪽 360px 전환 + 오른쪽 합계 · 2단 카드 */
	let { data } = $props();
	type View = 'claim' | 'inquiry';
	// 보던 쪽 · 탭은 실제 주소창에서 읽는다 — 전환은 얕은 replaceState 라 page.url 은 처음 들어온 주소(/cs)에 머문다(2026-11-05).
	let view = $state<View>(readParam('view', ['claim', 'inquiry'] as const, 'claim'));
	let claimTab = $state<CsTab>(readParam('tab', CS_TABS.map((t) => t.id), 'pending'));
	let inqTab = $state<InqTab>(readParam('inq', INQ_TABS.map((t) => t.id), 'waiting'));
	$effect(() => syncParam('view', view, 'claim'));
	$effect(() => syncParam('tab', claimTab, 'pending'));
	$effect(() => syncParam('inq', inqTab, 'waiting'));

	const claims = $derived(filterClaims(data.claims, claimTab));
	const claimTabs = $derived(claimTabCounts(data.claims));
	const claimWaiting = $derived(data.claims.filter((c) => c.status === 'pending').length);
	const inquiries = $derived(filterInquiries(data.inquiries, inqTab));
	const inqTabs = $derived(inqTabCounts(data.inquiries));
	const inqWaiting = $derived(data.inquiries.filter(isWaiting).length);
	// 이 화면이 읽은 대기 수로 뱃지를 맞춘다
	$effect(() => {
		app.inqWaiting = inqWaiting;
		app.claimWaiting = claimWaiting;
	});

	const segments = $derived([
		{ id: 'claim' as const, name: '교환 · 환불', count: claimWaiting },
		{ id: 'inquiry' as const, name: '고객 문의', count: inqWaiting }
	]);
	const total = $derived(view === 'inquiry' ? `답변 대기 ${inqWaiting} · 전체 ${data.inquiries.length}` : `대기 ${claimWaiting} · 전체 ${data.claims.length}`);

	const pick = (v: View) => (view = v);
</script>

{#snippet seg(cls: string, btn: string)}
	<div class="grid grid-cols-2 gap-1 rounded-[14px] bg-white/5 p-1 {cls}" role="tablist" aria-label="CS 종류">
		{#each segments as s (s.id)}
			{@const on = view === s.id}
			<button type="button" role="tab" aria-selected={on} onclick={() => pick(s.id)} class="flex items-center justify-center gap-1.5 rounded-[10px] font-bold transition-all {btn} {on ? 'bg-[#2a2c33] text-fg' : 'text-white/55'}">
				{s.name}
				<span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[11px] font-extrabold tabular-nums {s.count ? (on ? 'bg-accent text-bg' : 'bg-accent/20 text-accent') : 'bg-white/8 text-white/50'}">{s.count}</span>
			</button>
		{/each}
	</div>
{/snippet}

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<!-- 모바일 머리 -->
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:hidden">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em]">CS 관리</h1>
		<span class="text-[13px] text-white/50">{total}</span>
	</div>
	<div class="shrink-0 px-5 pb-2 lg:hidden">{@render seg('', 'h-10 text-[14px]')}</div>
	<!-- PC 머리 -->
	<div class="hidden items-center justify-between gap-4 lg:flex">
		<h1 class="sr-only">CS 관리</h1>
		{@render seg('w-[368px]', 'h-[42px] text-[15px]')}
		<span class="text-[14px] text-white/50">{total}</span>
	</div>

	{#if view === 'claim'}
		<FilterTabs tabs={claimTabs} bind:value={claimTab} label="요청 상태" />
		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
			<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
				{#each claims as c (c.id)}
					{@const tm = CS_TYPE_META[c.kind]}
					{@const sm = CS_STATUS_META[c.status]}
					<a
						href="/cs/{c.code}"
						class="flex flex-col gap-2.5 rounded-[18px] border bg-white/3 p-3.5 text-left transition-colors lg:gap-3 lg:rounded-[20px] lg:p-[18px] lg:hover:border-white/30 {isUrgentPending(c) ? 'border-accent/35' : 'border-white/8'}"
					>
						<span class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5"><Badge cls={tm.cls}>{tm.label}</Badge><Badge cls={sm.cls} strong={false}>{sm.label}</Badge></span>
							<span class="text-[11px] text-white/45 lg:text-[12px]">{c.code.toUpperCase()} · {relativeTime(c.createdAt)}</span>
						</span>
						<span class="flex items-center gap-3 lg:gap-3.5">
							<Tile tile="slate" bg={c.product?.tile} iconId={c.product?.icon} thumbUrl={c.product?.thumbUrl} icon={26} iconCls="lg:h-9 lg:w-9" class="h-11 w-11 rounded-xl lg:h-[52px] lg:w-[52px] lg:rounded-[14px]" />
							<span class="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-[3px]">
								<span class="truncate text-[14px] font-bold lg:text-[15px]">{c.order.item.name} × {c.qty}</span>
								<span class="text-[12px] text-white/55 lg:text-[13px]">{c.buyerName} · {c.reason}</span>
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
	{:else}
		<FilterTabs tabs={inqTabs} bind:value={inqTab} label="문의 상태" />
		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
			<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
				{#each inquiries as q (q.id)}
					{@const st = inqStatus(q)}
					<a href="/cs/inquiry/{q.code}" class="flex flex-col gap-2.5 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-left transition-colors lg:gap-3 lg:rounded-[20px] lg:p-[18px] lg:hover:border-white/25">
						<span class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5"><Badge cls={inqTypeCls(q.type)}>{q.type}</Badge><Badge cls={st.cls} strong={false}>{st.label}</Badge></span>
							<span class="truncate text-[11px] whitespace-nowrap text-white/45 lg:text-[12px]">{q.buyerName} · {relativeTime(q.createdAt)}</span>
						</span>
						<span class="flex items-start gap-3 lg:gap-3.5">
							<Tile tile="slate" bg={q.product?.tile} iconId={q.product?.icon} thumbUrl={q.product?.thumbUrl} icon={26} iconCls="lg:h-9 lg:w-9" class="h-11 w-11 rounded-xl lg:h-[52px] lg:w-[52px] lg:rounded-[14px]" />
							<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
								<span class="truncate text-[12px] text-white/50 lg:text-[13px]">{q.product?.name ?? '상품'}</span>
								<span class="line-clamp-2 text-[14px] leading-normal font-semibold text-white/92 lg:text-[15px]">{q.firstBody ?? ''}</span>
							</span>
						</span>
						{#if q.answer && !isWaiting(q)}
							<span class="flex items-center gap-1.5 text-[12px] text-white/50">
								<svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-5-5 5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></svg>
								<span class="min-w-0 truncate">{q.answer.body}</span>
							</span>
						{/if}
					</a>
				{:else}
					<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">{INQ_EMPTY[inqTab]}</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
