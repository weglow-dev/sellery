<script lang="ts">
	import { page } from '$app/state';
	import { settle, type LedgerTab } from '$lib/mock/settle.svelte';
	import { setParams } from '$lib/url';
	import Band from '$lib/components/Band.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SettleAmountModal from '$lib/components/SettleAmountModal.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** 정산 · 제조금액 원장 — docs/myr-admin-screens.md §10-1(시안 "MYR Admin PC" · "MYR Admin" 정산 · 2026-11-27). 하위 화면 · 요약 → (제조금액 없음 탭이면 주황 띠) → 탭(?tab= · 상환 중 기본) · 검색 → 상품별 원장 목록.
	 *  위쪽 알림 카드는 없다(시안) — 제조금액이 없는 상품은 [제조금액 없음] 탭에서 한 번만. 원장이 있으면 상세(/settle/ledger/[id]) · 없으면 줄의 [제조금액 입력] 모달. 칩 · 문구 · 건수는 서버(목) 값 */
	const tabs = $derived(settle.ledgerTabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? 'repay') as LedgerTab);
	let q = $state('');
	const rows = $derived(settle.ledgerList({ tab, q }));
	const band = $derived(settle.ledgerBand(tab));

	/** 제조금액 입력 모달 — 상품 id */
	let enter = $state<string | null>(null);

	const SUBS = [
		{ key: 'ledger', label: '제조금액 원장', href: '/settle' },
		{ key: 'rounds', label: '월 정산', href: '/settle/rounds' }
	];
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">정산 · 제조금액 원장</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={SUBS} value="ledger" label="정산 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">{settle.summary}</p>
	</div>

	{#if band}<div class="mt-5"><Band text={band} /></div>{/if}

	<div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
		<FilterTabs {tabs} value={tab} label="원장 상태" onpick={(id) => setParams(page.url, { tab: id === 'repay' ? null : id })} />
		<SearchBox bind:value={q} placeholder="상품 · 크리에이터 검색" label="원장 검색" />
	</div>

	<ListBox n={rows.length} empty="해당하는 원장이 없어요">
		{#each rows as r (r.id)}
			{#if r.href}
				<ListRow href={r.href} thumb={r.thumb} chips={r.chips} title={r.title} sub={r.sub} bar={r.bar} right={r.right} rightTone={r.rightTone} rightSub={r.rightSub} />
			{:else}
				{#snippet enterBtn(full: boolean)}
					<button type="button" onclick={() => (enter = r.id)} class="h-11 rounded-xl bg-accent px-3.5 text-[13px] font-bold whitespace-nowrap text-bg transition hover:brightness-110 lg:h-9 {full ? 'w-full' : 'w-[116px]'}">제조금액 입력</button>
				{/snippet}
				<ListRow onopen={() => (enter = r.id)} thumb={r.thumb} chips={r.chips} title={r.title} sub={r.sub} buttons={enterBtn} />
			{/if}
		{/each}
	</ListBox>
</div>

{#if enter}
	<SettleAmountModal productId={enter} onclose={() => (enter = null)} />
{/if}
