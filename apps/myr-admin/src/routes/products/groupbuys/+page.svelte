<script lang="ts">
	import { page } from '$app/state';
	import { groupbuys, type GroupbuyRow, type GroupbuyTab } from '$lib/mock/groupbuys.svelte';
	import { products } from '$lib/mock/products.svelte';
	import { setParams } from '$lib/url';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import GroupbuyEndModal from '$lib/components/GroupbuyEndModal.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** 상품 · 공구 링크 — docs/myr-admin-screens.md §9(시안 "MYR Admin PC" · "MYR Admin" 상품 › 공구 링크 · 2026-11-27). SubNav(상품 | 공구 링크) · 요약 → 탭(진행 중 · 예정 · 종료) → 줄(검색 없음).
	 *  줄(칩 · 기간 · 상품 · 크리에이터 · 공구가 · 매출 · 팔린 수량)을 누르면 공구 링크 상세 · [강제 종료](종료 전 · 96px).
	 *  칩 · 문구 · 건수 · 빈 상태는 서버(목) 값 */
	const subs = $derived(products.subs());
	const tabs = $derived(groupbuys.tabs());
	const t0 = $derived(page.url.searchParams.get('tab'));
	const tab = $derived<GroupbuyTab>(t0 === 'soon' || t0 === 'end' ? t0 : 'on');
	const list = $derived(groupbuys.list(tab));

	let ending = $state<GroupbuyRow | null>(null);
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-16">
	<h1 class="sr-only">상품 · 공구 링크</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={subs} value="groupbuys" label="상품 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">{groupbuys.sum}</p>
	</div>
	<div class="mt-5">
		<FilterTabs {tabs} value={tab} label="공구 상태" onpick={(id) => setParams(page.url, { tab: id })} />
	</div>

	<ListBox n={list.rows.length} empty={list.empty}>
		{#each list.rows as g (g.id)}
			{#snippet endBtn(full: boolean)}
				<button
					type="button"
					onclick={() => (ending = g)}
					class="h-11 rounded-xl border border-danger/28 bg-danger/10 px-3.5 text-[13px] font-bold whitespace-nowrap text-danger-fg transition hover:brightness-110 lg:h-9 {full ? 'w-full' : 'w-24'}">강제 종료</button
				>
			{/snippet}
			<ListRow href={g.href} thumb={g.thumb} chips={g.chips} meta={g.meta} title={g.title} sub={g.sub} right={g.right} rightSub={g.rightSub} buttons={g.canEnd ? endBtn : undefined} />
		{/each}
	</ListBox>
</div>

{#if ending}
	<GroupbuyEndModal id={ending.id} desc={ending.desc} onclose={() => (ending = null)} />
{/if}
