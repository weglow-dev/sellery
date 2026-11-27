<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { won } from '$lib/format';
	import { server } from '$lib/mock/server.svelte';
	import { payModal } from '$lib/pay-modal.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import Avatar from '$lib/components/Avatar.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KV from '$lib/components/KV.svelte';
	import PayoutButtons from '$lib/components/PayoutButtons.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 지급 건 상세 — docs/myr-admin-screens.md §11-4(2026-11-27 서랍 대신 페이지 · 주문 상세와 같은 틀).
	 *  머리(뒤로 · 크리에이터 · "지급 · 정산월" · 상태 칩) · 왼쪽 담긴 정산 줄 · 지급 정보 · 이체 시도 · 이력
	 *  / 오른쪽 고정 패널(금액 · 보류 이유 · 안내 · 버튼 · 지급 완료 기록 글자 링크). 모바일은 금액 · 버튼이 머리 바로 아래.
	 *  칩 · 안내 · 버튼은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const p = $derived(server.payouts.find((x) => x.id === id));
	/** 지급 완료 기록이 맨 앞이면(결과 확인 필요) 버튼 · 아니면 아래 글자 링크 */
	const recordFirst = $derived(!!p && p.actions[0] === 'record');
	const hasButtons = $derived(!!p && (recordFirst || p.actions.some((a) => a !== 'record')));
	const back = () => (history.length > 1 ? history.back() : goto('/payouts'));
</script>

{#snippet summary()}
	{#if p}
		<p class="text-[30px] font-extrabold tracking-[-0.03em] tabular-nums">{won(p.amount)}</p>
		{#if p.holdText}<p class="mt-2 text-[14px] font-semibold text-white/85">보류 이유 · {p.holdText}</p>{/if}
		{#if p.note}<p class="mt-1.5 text-[13px] leading-[1.55] {NOTE_CLS[p.noteTone]}">{p.note}</p>{/if}
	{/if}
{/snippet}

{#snippet actions()}
	{#if p}
		{#if hasButtons}
			<div class="flex gap-2"><PayoutButtons {p} full /></div>
		{:else}
			<p class="rounded-[14px] bg-white/4 px-4 py-3 text-center text-[13px] text-white/55">{p.sending?.noReply ? '웹훅이 오면 자동으로 바뀌어요 · 안 오면 자동으로 조회해요' : p.tabs.includes('sending') ? '은행 처리 중 · 결과가 오면 자동으로 바뀌어요' : '할 일이 없어요'}</p>
		{/if}
		{#if p.actions.includes('record') && !recordFirst}
			<p class="px-1 text-[13px] text-white/60">
				지급대행 밖에서 직접 보냈나요?
				<button type="button" onclick={() => payModal.show('record', [p.id])} class="ml-1 font-bold text-fg underline underline-offset-2">지급 완료 기록</button>
			</p>
		{/if}
	{/if}
{/snippet}

{#if !p}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">지급 건을 찾을 수 없어요</p>
		<a href="/payouts" class="mt-3 inline-block text-[14px] font-bold text-accent">지급 목록으로</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<!-- 머리 -->
		<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:min-h-[52px] lg:flex-nowrap">
			<button type="button" onclick={back} aria-label="뒤로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></button>
			<Avatar initial={p.initial} bg={p.avatarBg} size={48} />
			<div class="min-w-0 flex-1 lg:flex-none">
				<p class="text-[12.5px] font-semibold text-white/50">지급 · {p.month}</p>
				<h1 class="truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{p.name}</h1>
			</div>
			<span class="hidden flex-1 lg:block"></span>
			<div class="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
				{#each p.chips as c (c.label)}<Chip label={c.label} tone={c.tone} lg dot={c.label === '송금 중'} />{/each}
				<a href="/creators/{p.creatorId}" class="ml-1 text-[13px] text-white/50 underline-offset-2 hover:text-fg hover:underline lg:text-[14px]">{p.handle}</a>
			</div>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3 lg:gap-3.5">
				<!-- 모바일 — 금액 · 버튼이 위 -->
				<div class="flex flex-col gap-3 lg:hidden">
					<DetailCard>{@render summary()}</DetailCard>
					{@render actions()}
				</div>

				<DetailCard title="담긴 정산 줄" sub={p.linesText}>
					{#each p.lines as l, i (i)}
						<KV k={l.month}><span class="text-white/85">{l.product}</span> <span class="ml-2 font-extrabold tabular-nums">{won(l.amount)}</span></KV>
					{/each}
					{#if p.lines.length > 1}<p class="mt-2 text-[12px] text-white/55">지난 달 보류가 풀린 줄이 있으면 이 회차 지급 건에 같이 담겨요 · 지급 건 금액 {won(p.amount)}</p>{/if}
				</DetailCard>

				<DetailCard title="지급 정보">
					<KV k="받는 계좌">{p.account}</KV>
					{#if p.paid}
						<KV k="지급">{p.paid.at}</KV>
						<KV k="방식">{p.paid.by}</KV>
					{:else if p.nextTry}
						<KV k="다음 시도"><span class="text-accent">{p.nextTry}</span></KV>
					{/if}
					{#if p.fail?.check}<KV k="보낸 시각">{p.fail.check.sentAt}</KV>{/if}
					{#if p.opsHold}<KV k="운영 보류 메모"><span class="text-danger-fg">{p.opsHold.memo}</span><span class="mt-0.5 block text-[12px] font-medium text-white/55">{p.opsHold.by}</span></KV>{/if}
					{#if p.memo}<KV k="운영 메모">{p.memo}</KV>{/if}
					{#if p.paid && !p.paid.manual}<p class="mt-2 text-[12px] text-white/55">자동 이체로 지급된 건은 취소하지 않고 운영 메모로 남겨요</p>{/if}
				</DetailCard>

				{#if p.attempts.length}
					<DetailCard title="이체 시도 {p.tries}회">
						<ul class="flex flex-col gap-2">
							{#each [...p.attempts].reverse() as a, i (i)}
								<li class="rounded-2xl border border-white/8 px-4 py-3">
									<p class="flex items-center justify-between gap-2"><Chip label={a.result} tone={a.tone} /><span class="text-[12px] text-white/55 tabular-nums">{a.at}</span></p>
									{#if a.raw}
										<details class="mt-2 text-[12px] text-white/55">
											<summary class="cursor-pointer">응답 원문 · 지급대행 문의용</summary>
											<p class="mt-1 font-mono break-all text-white/60">{a.raw}</p>
										</details>
									{/if}
								</li>
							{/each}
						</ul>
					</DetailCard>
				{/if}

				<DetailCard title="이력"><Timeline items={p.log} /></DetailCard>
			</div>

			<!-- 오른쪽 고정 패널(PC) -->
			<aside class="sticky top-7 hidden flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-6 lg:flex">
				<DetailCard title="지급 건" plain>{@render summary()}</DetailCard>
				<div class="flex flex-col gap-2.5">{@render actions()}</div>
			</aside>
		</div>
	</div>
{/if}
