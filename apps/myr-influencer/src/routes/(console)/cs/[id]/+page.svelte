<script lang="ts">
	import { page } from '$app/state';
	import type { Me, Resolution } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { CS_STATUS_META, CS_TYPE_META, REPLY_CHIPS, approveLabel, canApprove, dueText, isUrgentPending, policyOf, resolutionName, resolutionOptions, timelineRows, won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Badge from '$lib/components/Badge.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import CheckDot from '$lib/components/CheckDot.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import SectionTitle from '$lib/components/SectionTitle.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 교환·환불 요청 상세 — 제품 · 고객 요청(사유 · 메시지 · 사진) · 처리 기준.
	 *  처리 대기면 처리 방법 선택 + 고객 메시지 → [반려] / [○○ 승인]. 처리된 요청은 처리 결과 + 처리 내역 타임라인.
	 *  모바일: 한 줄로 쌓고 하단 버튼 줄 / PC(lg~): 왼쪽 정보 + 오른쪽 420px 고정(sticky) 처리 패널 (디자인 "MYR Influencer Admin PC").
	 *  처리 방법·메시지 상태는 하나라 화면 폭을 바꿔도 입력이 이어진다.
	 *  UI 단계라 승인은 목 상태만 바꾼다 — 실제 환불(토스 부분 취소)·재발송 운송장은 myr-shop 의 환불 RPC(0061)·발송 처리(0069)와 연결할 때 붙는다. */
	const c = $derived(app.cs.find((x) => x.id === page.params.id));

	let resolution = $state<Resolution | null>(null);
	let reply = $state('');
	const ok = $derived(canApprove(resolution, reply));

	function approve() {
		if (!c || !resolution || !ok) return;
		app.resolveCs(c.id, 'progress', resolution, (page.data.me as Me).name);
		goBack('/cs');
	}
	function reject() {
		if (!c) return;
		app.resolveCs(c.id, 'rejected', 'reject', (page.data.me as Me).name);
		goBack('/cs');
	}
</script>

{#snippet options(item: NonNullable<typeof c>)}
	<div class="flex flex-col gap-2" role="radiogroup" aria-label="처리 방법">
		{#each resolutionOptions(item) as r (r.id)}
			{@const on = resolution === r.id}
			<button
				type="button"
				role="radio"
				aria-checked={on}
				onclick={() => (resolution = r.id)}
				class="flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-all {on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/3 lg:hover:border-white/25'}"
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
{/snippet}

{#snippet replyBox()}
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each REPLY_CHIPS as rc (rc.name)}
			<button type="button" onclick={() => (reply = rc.text)} class="rounded-full border border-white/12 px-3 py-2 text-[12px] font-semibold text-white/80 transition-colors lg:hover:border-accent lg:hover:text-accent">{rc.name}</button>
		{/each}
	</div>
	<textarea class={TEXTAREA} rows="4" bind:value={reply} maxlength="1000" aria-label="고객에게 보낼 메시지" placeholder="고객에게 전달될 안내 문구를 적어주세요"></textarea>
{/snippet}

{#snippet timeline(item: NonNullable<typeof c>)}
	<ol class="flex flex-col">
		{#each timelineRows(item) as tl (tl.title + tl.when)}
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
{/snippet}

{#snippet actions(cls: string)}
	<button type="button" onclick={reject} class="w-24 shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg transition-colors lg:hover:border-white/35 {cls}">반려</button>
	<button
		type="button"
		onclick={approve}
		disabled={!ok}
		class="flex-1 rounded-2xl font-extrabold transition-colors duration-250 {ok ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'} {cls}">{c ? approveLabel(c, resolution) : ''}</button
	>
{/snippet}

{#if c}
	{@const tm = CS_TYPE_META[c.type]}
	{@const sm = CS_STATUS_META[c.status]}
	{@const pendingNow = c.status === 'pending'}
	<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
		<BackHeader title="{tm.label} 요청" fallback="/cs">
			{#snippet right()}<span class="text-[12px] text-white/45">{c.no}</span>{/snippet}
		</BackHeader>

		<!-- PC 제목 줄 -->
		<div class="hidden items-center gap-3 lg:flex">
			<PcBack onclick={() => goBack('/cs')} />
			<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">{tm.label} 요청</h1>
			<span class="ml-auto flex items-center gap-2.5">
				<span class="rounded-lg px-3 py-1.5 text-[13px] font-bold {sm.cls}">{sm.label}</span>
				<span class="text-[13px] text-white/45">{c.no} · {c.ago}</span>
			</span>
		</div>

		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-8 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
			<div>
				<div class="flex items-center gap-2 lg:hidden">
					<Badge cls={tm.cls} lg>{tm.label}</Badge>
					<Badge cls={sm.cls} lg strong={false}>{sm.label}</Badge>
					{#if isUrgentPending(c)}<span class="ml-auto text-[12px] font-bold text-accent">{dueText(c)}</span>{/if}
				</div>

				<div class="mt-4 flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:mt-0 lg:gap-4 lg:p-[18px]">
					<Tile tile={c.tile} icon={36} iconCls="lg:h-11 lg:w-11" class="h-16 w-16 rounded-2xl lg:h-20 lg:w-20 lg:rounded-[18px]" />
					<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
						<span class="text-[15px] leading-[1.3] font-bold lg:text-[17px]">{c.product}</span>
						<span class="text-[12px] text-white/55 lg:text-[13px]">{c.qty}개 · 주문 {c.orderNo}</span>
						<span class="mt-0.5 text-[15px] font-extrabold tabular-nums lg:hidden">{won(c.amount)}</span>
					</span>
					<span class="hidden text-[20px] font-extrabold whitespace-nowrap tabular-nums lg:block">{won(c.amount)}</span>
				</div>

				<SectionTitle>고객 요청</SectionTitle>
				<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
					<div class="flex items-center gap-2.5 lg:gap-3">
						<span class="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/8 text-[12px] font-extrabold lg:h-10 lg:w-10 lg:text-[14px]" aria-hidden="true">{c.customer[0]}</span>
						<span>
							<span class="block text-[14px] font-bold lg:text-[15px]">{c.customer}</span>
							<span class="block text-[12px] text-white/50 lg:text-[13px]">{c.phone} · 수령 {c.receivedAgo}</span>
						</span>
						<span class="ml-auto hidden items-center gap-2 lg:flex">
							<span class="text-[12px] text-white/50">사유</span>
							<span class="rounded-lg bg-white/6 px-2.5 py-[5px] text-[13px] font-bold">{c.reason}</span>
						</span>
					</div>
					<div class="mt-3 flex items-center gap-2 lg:hidden">
						<span class="text-[12px] text-white/50">사유</span>
						<span class="rounded-lg bg-white/6 px-[9px] py-1 text-[12px] font-bold">{c.reason}</span>
					</div>
					{#if c.message}
						<p class="mt-3 text-[14px] leading-[1.65] text-pretty text-white/85 lg:mt-4 lg:text-[15px] lg:leading-[1.7]">"{c.message}"</p>
					{/if}
					{#if c.photos.length}
						<div class="mt-3 flex gap-1.5 lg:mt-4 lg:gap-2">
							{#each c.photos as ph (ph)}
								<span class="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/6 text-[11px] text-white/45 lg:h-[88px] lg:w-[88px] lg:rounded-[14px] lg:text-[12px]">{ph}</span>
							{/each}
						</div>
					{/if}
				</div>

				<SectionTitle>처리 기준</SectionTitle>
				<ul class="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/7 px-4 py-3.5 text-[13px] leading-normal text-white/80 lg:gap-2.5 lg:rounded-[20px] lg:px-5 lg:py-[18px] lg:text-[14px]">
					{#each policyOf(c) as pl (pl)}
						<li class="flex items-start gap-2 lg:gap-2.5"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent lg:mt-2" aria-hidden="true"></span><span>{pl}</span></li>
					{/each}
				</ul>

				<!-- 모바일: 처리 방법 · 메시지 또는 처리 내역 (PC 는 오른쪽 패널) -->
				<div class="lg:hidden">
					{#if pendingNow}
						<SectionTitle>처리 방법</SectionTitle>
						{@render options(c)}
						<SectionTitle>고객에게 보낼 메시지</SectionTitle>
						{@render replyBox()}
					{:else}
						<SectionTitle>처리 내역</SectionTitle>
						{@render timeline(c)}
					{/if}
				</div>
			</div>

			<!-- PC 오른쪽 고정 패널 -->
			<aside class="sticky top-8 hidden rounded-3xl border border-white/8 bg-panel p-6 lg:block">
				{#if pendingNow}
					<div class="flex items-center justify-between">
						<p class="text-[16px] font-extrabold">처리 방법</p>
						{#if isUrgentPending(c)}<span class="flex items-center gap-[5px] text-[12px] font-bold text-accent"><Icon id="clock" size={13} sw={2.2} />{dueText(c)}</span>{/if}
					</div>
					<div class="mt-3.5">{@render options(c)}</div>
					<p class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70">고객에게 보낼 메시지</p>
					{@render replyBox()}
					<div class="mt-4 flex gap-2.5">{@render actions('h-[54px] text-[15px]')}</div>
				{:else}
					<p class="text-[16px] font-extrabold">처리 결과</p>
					<dl class="mt-3.5 flex flex-col gap-2.5 text-[14px]">
						<div class="flex justify-between text-white/60"><dt>처리 방법</dt><dd class="font-semibold text-fg">{resolutionName(c)}</dd></div>
						<div class="flex justify-between text-white/60"><dt>금액</dt><dd class="font-semibold text-fg tabular-nums">{won(c.amount)}</dd></div>
						<div class="mt-1 flex items-baseline justify-between border-t border-white/8 pt-3"><dt class="font-bold">상태</dt><dd class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold {sm.cls}">{sm.label}</dd></div>
					</dl>
					<p class="mt-[22px] mb-3 text-[14px] font-extrabold text-white/70">처리 내역</p>
					{@render timeline(c)}
					<button type="button" onclick={() => goBack('/cs')} class="mt-2 h-[54px] w-full rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg transition-colors hover:border-white/35">목록으로</button>
				{/if}
			</aside>
		</div>

		{#if pendingNow}
			<BottomBar>{@render actions('h-14 text-[16px]')}</BottomBar>
		{/if}
	</div>
{:else}
	<div class="flex min-h-0 flex-1 flex-col lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7">
		<BackHeader title="요청 상세" fallback="/cs" />
		<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
			<p class="text-[15px] text-white/65">요청을 찾을 수 없어요</p>
			<a href="/cs" class="text-[14px] font-bold text-accent">CS 관리로</a>
		</div>
	</div>
{/if}
