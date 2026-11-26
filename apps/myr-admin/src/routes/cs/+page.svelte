<script lang="ts">
	import { page } from '$app/state';
	import { cs, type ClaimTab } from '$lib/mock/cs.svelte';
	import { setParams } from '$lib/url';
	import Band from '$lib/components/Band.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** CS 관리 · 교환 · 환불 요청 목록 — docs/myr-admin-screens.md §8-1. SubNav(교환 · 환불 | 고객 문의) → 요약 → 탭(회수 후 환불 · 재발송(교환 전부 — 회수 확인 필요 칩 + 자동 발송) · 환불할 차례 · 처리 대기 · 완료 · 반려 · 전체) → 검색 → 줄 → 요청 상세(/cs/[id]). 홈 칩 "회수 확인 필요"는 ?tab=collect(탭 줄에 없는 묶음 · 위에 띠)로 연다.
	 *  칩 · 기한 문구 · 건수 · 빈 상태 문구는 서버(목) 값 — 화면은 탭(?tab=) · 검색어만 넘긴다. 크리에이터 답변 기한 넘김은 빨간 글자(표시만 · 운영 처리 조건이 아니다) */
	const subs = $derived(cs.subs());
	const tabs = $derived(cs.claimTabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? 'pickup') as ClaimTab);
	let q = $state('');
	const list = $derived(cs.claims({ tab, q }));
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">CS 관리 · 교환 · 환불</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={subs} value="claims" label="CS 관리 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">{cs.claimSummary()}</p>
	</div>

	<div class="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<FilterTabs {tabs} value={tab} label="요청 단계" onpick={(id) => setParams(page.url, { tab: id })} />
		<SearchBox bind:value={q} placeholder="요청번호 · 주문번호 · 상품 · 크리에이터" label="요청 검색" />
	</div>

	{#if cs.claimBand(tab)}<div class="mt-3"><Band tone="orange" text={cs.claimBand(tab) ?? ''} /></div>{/if}

	<ListBox n={list.rows.length} empty={list.empty}>
		{#each list.rows as r (r.id)}
			<ListRow href="/cs/{r.id}" thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} right={r.right} rightSub={r.rightSub || undefined} rightSubTone={r.rightSubTone} />
		{/each}
	</ListBox>
</div>
