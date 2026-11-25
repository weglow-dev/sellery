<script lang="ts">
	import { page } from '$app/state';
	import { groupbuys, type GroupbuyRow, type GroupbuyTab } from '$lib/mock/groupbuys.svelte';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import { setParams } from '$lib/url';
	import Btn from '$lib/components/Btn.svelte';
	import Field from '$lib/components/Field.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';

	/** 공구 링크 — docs/myr-admin-screens.md §9. 탭(진행 중 · 예정 · 종료) → 검색 → 줄(상품 · 크리에이터 · 공구가 · 할인율 · 기간 · 링크 코드 복사 · 팔린 수량 · 매출).
	 *  줄은 열리지 않는다 · 동작은 [강제 종료]뿐(사유 필수 · 한 번 더 확인 · §1-2). 칩 · 문구 · 건수 · 빈 상태는 서버(목) 값 */
	const tabs = $derived(groupbuys.tabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? 'on') as GroupbuyTab);
	let q = $state('');
	const list = $derived(groupbuys.list({ tab, q }));

	let ending = $state<GroupbuyRow | null>(null);
	let why = $state('');
	const ask = (g: GroupbuyRow) => {
		why = '';
		ending = g;
	};
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<PageHead title="공구 링크">
		{#snippet sum()}{groupbuys.sum}{/snippet}
	</PageHead>

	<div class="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
		<FilterTabs {tabs} value={tab} label="공구 상태" onpick={(id) => setParams(page.url, { tab: id })} />
		<SearchBox bind:value={q} placeholder="검색" label="공구 링크 검색" />
	</div>

	<ListBox n={list.rows.length} empty={list.empty}>
		{#each list.rows as g (g.id)}
			{#snippet endBtn(full: boolean)}
				<Btn sm {full} onclick={() => ask(g)}>강제 종료</Btn>
			{/snippet}
			<ListRow thumb={g.thumb} chips={g.chips} meta={g.meta} title={g.title} sub={g.sub} copy={g.copy} right={g.right} rightSub={g.rightSub} buttons={g.canEnd ? endBtn : undefined} />
		{/each}
	</ListBox>
</div>

{#if ending}
	{@const g = ending}
	<Modal
		title="강제 종료"
		desc={g.desc}
		ok="강제 종료"
		sure="정말 강제 종료하기"
		danger
		info="정말 강제 종료할까요? 크리에이터에게 사유와 함께 알림이 가요"
		disabled={!why.trim()}
		onclose={() => (ending = null)}
		onok={() => {
			const r = groupbuys.forceEnd(g.id, why);
			if (!r.ok) return r.msg;
			app.showToast(r.msg);
			ending = null;
		}}
	>
		<Field label="사유(필수)" count="{why.length}/200">
			<textarea bind:value={why} maxlength="200" rows="3" class={TEXTAREA} placeholder="왜 종료하는지 적어 주세요"></textarea>
		</Field>
		<p class="text-[13px] leading-[1.5] font-semibold text-danger-fg">종료하면 링크가 바로 닫히고 다시 열 수 없어요</p>
	</Modal>
{/if}
