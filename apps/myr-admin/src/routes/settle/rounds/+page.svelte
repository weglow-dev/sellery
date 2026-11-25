<script lang="ts">
	import { settle } from '$lib/mock/settle.svelte';
	import { app } from '$lib/state.svelte';
	import Band from '$lib/components/Band.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** 정산 · 월 정산 회차 목록 — docs/myr-admin-screens.md §10-2. 회차는 매월 1일 오후 1시 자동 계산 · 확정([확정] 버튼 없음).
	 *  [회차 수동 실행]은 자동 실행이 실패했을 때 · 끝난 달만 — 11월분은 서버가 거절한다. 보류가 안 풀린 줄이 있으면 빨간 띠 */
	const rows = $derived(settle.rounds());
	const band = $derived(settle.roundsBand);
	const run = settle.runModal;

	let runOpen = $state(false);
	let month = $state(run.months[0]);

	const SUBS = [
		{ key: 'ledger', label: '제조 원장', href: '/settle' },
		{ key: 'rounds', label: '월 정산', href: '/settle/rounds' }
	];
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">정산 · 월 정산</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={SUBS} value="rounds" label="정산 화면" />
		<div class="flex items-center justify-between gap-3.5 lg:justify-end">
			<p class="text-[13px] text-white/60 lg:text-[14px]">{settle.roundsSummary}</p>
			<Btn sm kind="ghost" onclick={() => (runOpen = true)}>회차 수동 실행</Btn>
		</div>
	</div>

	{#if band}<div class="mt-5"><Band tone="red" text={band} /></div>{/if}

	<ListBox n={rows.length} empty="아직 정산 회차가 없어요">
		{#each rows as r (r.month)}
			{#if r.href}
				<ListRow href={r.href} tileText={r.tileText} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} bar={r.bar} right={r.right} rightSub={r.rightSub} />
			{:else}
				<ListRow onopen={() => app.showToast(settle.onlyOct)} tileText={r.tileText} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} bar={r.bar} right={r.right} rightSub={r.rightSub} />
			{/if}
		{/each}
	</ListBox>
</div>

{#if runOpen}
	<Modal title={run.title} desc={run.desc} ok={run.ok} sure={run.sure} info={run.info} infoTone="grey" onclose={() => (runOpen = false)} onok={() => settle.runRound().msg}>
		<div class="flex flex-col gap-1.5">
			<p class="text-[13px] font-semibold text-white/80">정산월</p>
			<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="정산월">
				{#each run.months as m (m)}
					<button type="button" role="radio" aria-checked={month === m} onclick={() => (month = m)} class="h-[42px] rounded-xl border px-[15px] text-[13.5px] font-semibold transition-colors {month === m ? 'border-accent bg-accent/12 text-accent' : 'border-white/12 text-white/70 hover:border-white/30'}">{m}</button>
				{/each}
			</div>
		</div>
	</Modal>
{/if}
