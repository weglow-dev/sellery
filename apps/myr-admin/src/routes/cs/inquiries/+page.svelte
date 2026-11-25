<script lang="ts">
	import { page } from '$app/state';
	import { cs, type InquiryTab } from '$lib/mock/cs.svelte';
	import { setParams } from '$lib/url';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** CS 관리 · 고객 문의 목록 — docs/myr-admin-screens.md §7-1. SubNav(교환 · 환불 | 고객 문의) → 요약 → 탭(답변 대기 · 24시간 넘은 미답변 · 답변 완료 · 종료) → 검색 → 줄 → 문의 상세(/cs/inquiries/[id]).
	 *  칩(지난 시간 · 24시간 넘음) · 건수 · 빈 상태 문구는 서버(목) 값 — 화면은 탭 · 검색어만 넘긴다 */
	const subs = $derived(cs.subs());
	const tabs = $derived(cs.inquiryTabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? 'open') as InquiryTab);
	let q = $state('');
	const list = $derived(cs.inquiries({ tab, q }));
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">CS 관리 · 고객 문의</h1>
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={subs} value="inquiries" label="CS 관리 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">{cs.inquirySummary()}</p>
	</div>

	<div class="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<FilterTabs {tabs} value={tab} label="문의 상태" onpick={(id) => setParams(page.url, { tab: id })} />
		<SearchBox bind:value={q} placeholder="문의번호 · 고객 · 상품 · 질문" label="문의 검색" />
	</div>

	<ListBox n={list.rows.length} empty={list.empty}>
		{#each list.rows as r (r.id)}
			<ListRow href="/cs/inquiries/{r.id}" thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} />
		{/each}
	</ListBox>
</div>
