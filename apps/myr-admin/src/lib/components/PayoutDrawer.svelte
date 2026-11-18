<script lang="ts">
	import { won } from '$lib/format';
	import type { PayoutView } from '$lib/mock/types';
	import { payModal } from '$lib/pay-modal.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import Avatar from './Avatar.svelte';
	import Chip from './Chip.svelte';
	import Drawer from './Drawer.svelte';
	import KV from './KV.svelte';
	import PayoutButtons from './PayoutButtons.svelte';
	import Section from './Section.svelte';
	import Timeline from './Timeline.svelte';

	/** 지급 건 상세(오른쪽 서랍 · §11-4) — 머리(크리에이터 · 정산월 · 상태 · 금액) · 담긴 정산 줄 · 지급 정보 · 이체 시도 · 이력 */
	let { p, onclose }: { p: PayoutView; onclose: () => void } = $props();
	/** 지급 완료 기록이 맨 앞이면(결과 확인 필요) 버튼 · 아니면 아래 글자 링크 */
	const recordFirst = $derived(p.actions[0] === 'record');
	const hasButtons = $derived(recordFirst || p.actions.some((a) => a !== 'record'));
</script>

<Drawer title="{p.name} · {p.month} 지급 건" {onclose}>
	{#snippet head()}
		<div class="flex items-center gap-3">
			<Avatar initial={p.initial} bg={p.avatarBg} size={44} />
			<div class="min-w-0 flex-1">
				<p class="truncate text-[17px] font-extrabold">{p.name}</p>
				<p class="truncate text-[13px] text-white/55">{p.handle} · {p.month}</p>
			</div>
			<a href="/creators?id={p.creatorId}" class="text-[13px] font-bold text-white/60 hover:text-fg">크리에이터</a>
		</div>
		<div class="mt-5 rounded-3xl bg-white/4 p-5">
			<div class="flex flex-wrap gap-1.5">{#each p.chips as c (c.label)}<Chip label={c.label} tone={c.tone} lg dot={c.label === '송금 중'} />{/each}</div>
			<p class="mt-3 text-[30px] font-extrabold tracking-[-0.03em] tabular-nums">{won(p.amount)}</p>
			{#if p.holdText}<p class="mt-2 text-[14px] font-semibold text-white/85">보류 이유 · {p.holdText}</p>{/if}
			{#if p.note}<p class="mt-1.5 text-[13px] leading-[1.55] {NOTE_CLS[p.noteTone]}">{p.note}</p>{/if}
		</div>
	{/snippet}

	<Section title="담긴 정산 줄">
		{#snippet aside()}{p.linesText}{/snippet}
		<div class="rounded-2xl border border-white/8 px-4 py-1">
			{#each p.lines as l, i (i)}
				<KV k={l.month}><span class="text-white/85">{l.product}</span> <span class="ml-2 font-extrabold tabular-nums">{won(l.amount)}</span></KV>
			{/each}
		</div>
		{#if p.lines.length > 1}<p class="mt-2 px-1 text-[12px] text-white/55">지난 달 보류가 풀린 줄이 있으면 이 회차 지급 건에 같이 담겨요 · 지급 건 금액 {won(p.amount)}</p>{/if}
	</Section>

	<Section title="지급 정보">
		<div class="rounded-2xl border border-white/8 px-4 py-1">
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
		</div>
		{#if p.paid && !p.paid.manual}<p class="mt-2 px-1 text-[12px] text-white/55">자동 이체로 지급된 건은 취소하지 않고 운영 메모로 남겨요</p>{/if}
	</Section>

	{#if p.attempts.length}
		<Section title="이체 시도 {p.tries}회">
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
		</Section>
	{/if}

	<Section title="이력">
		<Timeline items={p.log} />
	</Section>

	{#if p.actions.includes('record') && !recordFirst}
		<p class="mt-6 rounded-2xl bg-white/3 px-4 py-3 text-[13px] text-white/60">
			지급대행 밖에서 직접 보냈나요?
			<button type="button" onclick={() => payModal.show('record', [p.id])} class="ml-1 font-bold text-fg underline underline-offset-2">지급 완료 기록</button>
		</p>
	{/if}

	{#snippet footer()}
		{#if hasButtons}
			<PayoutButtons {p} full />
		{:else}
			<p class="w-full py-2 text-center text-[13px] text-white/55">{p.sending?.noReply ? '웹훅이 오면 자동으로 바뀌어요 · 안 오면 자동으로 조회해요' : p.tabs.includes('sending') ? '은행 처리 중 · 결과가 오면 자동으로 바뀌어요' : '할 일이 없어요'}</p>
		{/if}
	{/snippet}
</Drawer>
