<script lang="ts">
	import { page } from '$app/state';
	import type { Resolution } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { CS_STATUS_META, CS_TYPE_META, REPLY_CHIPS, approveLabel, canApprove, dueText, isUrgentPending, policyOf, resolutionOptions, timelineRows, won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Badge from '$lib/components/Badge.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import CheckDot from '$lib/components/CheckDot.svelte';
	import SectionTitle from '$lib/components/SectionTitle.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 교환·환불 요청 상세 — 제품 · 고객 요청(사유 · 메시지 · 사진) · 처리 기준.
	 *  처리 대기면 처리 방법 선택 + 고객 메시지 → [반려] / [○○ 승인]. 처리된 요청은 처리 내역 타임라인.
	 *  UI 단계라 승인은 목 상태만 바꾼다 — 실제 환불(토스 부분 취소)·재발송 운송장은 myr-shop 의 환불 RPC(0061)·발송 처리(0069)와 연결할 때 붙는다. */
	const c = $derived(app.cs.find((x) => x.id === page.params.id));

	let resolution = $state<Resolution | null>(null);
	let reply = $state('');
	const ok = $derived(canApprove(resolution, reply));

	function approve() {
		if (!c || !resolution || !ok) return;
		app.resolveCs(c.id, 'progress', resolution);
		goBack('/cs');
	}
	function reject() {
		if (!c) return;
		app.resolveCs(c.id, 'rejected', 'reject');
		goBack('/cs');
	}
</script>

{#if c}
	{@const tm = CS_TYPE_META[c.type]}
	{@const sm = CS_STATUS_META[c.status]}
	{@const pendingNow = c.status === 'pending'}
	<div class="flex min-h-0 flex-1 animate-slide-in flex-col">
		<BackHeader title="{tm.label} 요청" fallback="/cs">
			{#snippet right()}<span class="text-[12px] text-white/45">{c.no}</span>{/snippet}
		</BackHeader>

		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-8">
			<div class="flex items-center gap-2">
				<Badge cls={tm.cls} lg>{tm.label}</Badge>
				<Badge cls={sm.cls} lg strong={false}>{sm.label}</Badge>
				{#if isUrgentPending(c)}<span class="ml-auto text-[12px] font-bold text-accent">{dueText(c)}</span>{/if}
			</div>

			<div class="mt-4 flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-4">
				<Tile tile={c.tile} icon={36} class="h-16 w-16 rounded-2xl" />
				<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
					<span class="text-[15px] leading-[1.3] font-bold">{c.product}</span>
					<span class="text-[12px] text-white/55">{c.qty}개 · 주문 {c.orderNo}</span>
					<span class="mt-0.5 text-[15px] font-extrabold tabular-nums">{won(c.amount)}</span>
				</span>
			</div>

			<SectionTitle>고객 요청</SectionTitle>
			<div class="rounded-[20px] border border-white/8 bg-white/3 p-4">
				<div class="flex items-center gap-2.5">
					<span class="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/8 text-[12px] font-extrabold" aria-hidden="true">{c.customer[0]}</span>
					<span>
						<span class="block text-[14px] font-bold">{c.customer}</span>
						<span class="block text-[12px] text-white/50">{c.phone} · 수령 {c.receivedAgo}</span>
					</span>
				</div>
				<div class="mt-3 flex items-center gap-2">
					<span class="text-[12px] text-white/50">사유</span>
					<span class="rounded-lg bg-white/6 px-[9px] py-1 text-[12px] font-bold">{c.reason}</span>
				</div>
				{#if c.message}
					<p class="mt-3 text-[14px] leading-[1.65] text-pretty text-white/85">"{c.message}"</p>
				{/if}
				{#if c.photos.length}
					<div class="mt-3 flex gap-1.5">
						{#each c.photos as ph (ph)}
							<span class="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/6 text-[11px] text-white/45">{ph}</span>
						{/each}
					</div>
				{/if}
			</div>

			<SectionTitle>처리 기준</SectionTitle>
			<ul class="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/7 px-4 py-3.5 text-[13px] leading-normal text-white/80">
				{#each policyOf(c) as pl (pl)}
					<li class="flex items-start gap-2"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span><span>{pl}</span></li>
				{/each}
			</ul>

			{#if pendingNow}
				<SectionTitle>처리 방법</SectionTitle>
				<div class="flex flex-col gap-2" role="radiogroup" aria-label="처리 방법">
					{#each resolutionOptions(c) as r (r.id)}
						{@const on = resolution === r.id}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							onclick={() => (resolution = r.id)}
							class="flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-all {on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/3'}"
						>
							<span class="box-border flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {on ? 'border-accent bg-accent' : 'border-white/30'}">
								{#if on}<span class="h-2 w-2 rounded-full bg-bg"></span>{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-[14px] font-bold">{r.title}</span>
								<span class="mt-0.5 block text-[12px] text-white/55">{r.desc}</span>
							</span>
						</button>
					{/each}
				</div>

				<SectionTitle>고객에게 보낼 메시지</SectionTitle>
				<div class="mb-2 flex flex-wrap gap-1.5">
					{#each REPLY_CHIPS as rc (rc.name)}
						<button type="button" onclick={() => (reply = rc.text)} class="rounded-full border border-white/12 px-3 py-2 text-[12px] font-semibold text-white/80">{rc.name}</button>
					{/each}
				</div>
				<textarea class={TEXTAREA} rows="4" bind:value={reply} maxlength="1000" aria-label="고객에게 보낼 메시지" placeholder="고객에게 전달될 안내 문구를 적어주세요"></textarea>
			{:else}
				<SectionTitle>처리 내역</SectionTitle>
				<ol class="flex flex-col">
					{#each timelineRows(c) as tl (tl.title + tl.when)}
						<li class="flex gap-3.5">
							<div class="flex shrink-0 flex-col items-center">
								<CheckDot on={tl.done} />
								{#if !tl.last}<span class="min-h-[18px] w-0.5 flex-1 bg-white/10"></span>{/if}
							</div>
							<div class="pb-3.5">
								<p class="mt-px text-[14px] font-bold {tl.done ? 'text-fg' : 'text-white/60'}">{tl.title}</p>
								<p class="mt-[3px] text-[12px] text-white/50">{tl.when}</p>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>

		{#if pendingNow}
			<BottomBar>
				<button type="button" onclick={reject} class="h-14 w-24 shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg">반려</button>
				<button
					type="button"
					onclick={approve}
					disabled={!ok}
					class="h-14 flex-1 rounded-2xl text-[16px] font-extrabold transition-colors duration-250 {ok ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{approveLabel(c, resolution)}</button
				>
			</BottomBar>
		{/if}
	</div>
{:else}
	<div class="flex min-h-0 flex-1 flex-col">
		<BackHeader title="요청 상세" fallback="/cs" />
		<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
			<p class="text-[15px] text-white/65">요청을 찾을 수 없어요</p>
			<a href="/cs" class="text-[14px] font-bold text-accent">CS 관리로</a>
		</div>
	</div>
{/if}
