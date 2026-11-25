<script lang="ts">
	import { page } from '$app/state';
	import { settle, type LedgerTab } from '$lib/mock/settle.svelte';
	import { setParams } from '$lib/url';
	import Btn from '$lib/components/Btn.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SettleAmountModal from '$lib/components/SettleAmountModal.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** 정산 · 제조 원장 — docs/myr-admin-screens.md §10-1. 맨 위 빨간 카드 두 묶음(보류된 정산 · 원장 없는 판매 상품) → 탭(?tab=) · 검색 → 상품별 원장 목록.
	 *  원장이 있으면 상세(/settle/ledger/[id]) · 없으면 [제조금액 입력] 모달. 칩 · 문구 · 건수는 서버(목) 값 */
	const tabs = $derived(settle.ledgerTabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? 'all') as LedgerTab);
	let q = $state('');
	const rows = $derived(settle.ledgerList({ tab, q }));
	const alerts = $derived(settle.alerts());

	/** 제조금액 입력 모달 — 상품 id */
	let enter = $state<string | null>(null);

	const SUBS = [
		{ key: 'ledger', label: '제조 원장', href: '/settle' },
		{ key: 'rounds', label: '월 정산', href: '/settle/rounds' }
	];
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">정산 · 제조 원장</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={SUBS} value="ledger" label="정산 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">{settle.summary}</p>
	</div>

	<!-- 입력 대기 — 보류된 정산 · 판매 중인데 원장이 없는 상품 (빨간 카드 · PC 2열) -->
	{#if alerts.length}
		<div class="mt-5 grid items-start gap-3.5 lg:grid-cols-2">
			{#each alerts as al (al.key)}
				<section class="min-w-0 rounded-3xl border border-danger/30 bg-danger/6 p-5 lg:px-[22px]">
					<h2 class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span class="text-[16px] font-extrabold text-danger-fg">{al.title}</span><span class="text-[13px] font-normal text-white/60">{al.sub}</span></h2>
					<ul class="mt-3.5 flex flex-col gap-2.5">
						{#each al.items as it (it.id)}
							<li class="flex items-center gap-3">
								<ProductThumb tile={it.thumb.tile} icon={it.thumb.icon} size={44} radius={13} />
								<div class="min-w-0 flex-1">
									<p class="truncate text-[15px] font-bold">{it.title}</p>
									<p class="mt-[3px] truncate text-[13px] text-white/60 tabular-nums">{it.sub}</p>
								</div>
								<Btn sm kind="primary" onclick={() => (enter = it.id)}>제조금액 입력</Btn>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}

	<div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
		<FilterTabs {tabs} value={tab} label="원장 상태" onpick={(id) => setParams(page.url, { tab: id === 'all' ? null : id })} />
		<SearchBox bind:value={q} placeholder="상품 · 크리에이터 검색" label="원장 검색" />
	</div>

	<ListBox n={rows.length} empty="해당하는 원장이 없어요">
		{#each rows as r (r.id)}
			{#if r.href}
				<ListRow href={r.href} thumb={r.thumb} chips={r.chips} title={r.title} sub={r.sub} bar={r.bar} right={r.right} rightTone={r.rightTone} rightSub={r.rightSub} />
			{:else}
				<ListRow onopen={() => (enter = r.id)} thumb={r.thumb} chips={r.chips} title={r.title} sub={r.sub} right={r.right} rightTone={r.rightTone} rightSub={r.rightSub} />
			{/if}
		{/each}
	</ListBox>
</div>

{#if enter}
	<SettleAmountModal productId={enter} onclose={() => (enter = null)} />
{/if}
