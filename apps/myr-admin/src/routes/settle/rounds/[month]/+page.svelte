<script lang="ts">
	import { page } from '$app/state';
	import { settle } from '$lib/mock/settle.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import DetailHead from '$lib/components/DetailHead.svelte';
	import SettleTable from '$lib/components/SettleTable.svelte';
	import Stats from '$lib/components/Stats.svelte';

	/** 월 정산 회차 상세 — docs/myr-admin-screens.md §10-3. 오른쪽 패널 없는 넓은 화면: 요약 숫자 + 지급 진행 막대 → 크리에이터별 묶음(그 회차 지급 건 칩 · [지급 건 열기] → §11 서랍) → 상품 줄 표(누르면 주문 내역 · 정산금 펼침).
	 *  보류 줄 · 보류 해제 줄 표시 · 지급 건 상태 칩은 서버 값 */
	const month = $derived(page.params.month ?? '');
	const d = $derived(settle.round(month));
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	{#if d}
		<DetailHead back="/settle/rounds" backLabel="월 정산 목록으로" title={d.title} sub={d.sub} />
		<div class="mt-5 flex flex-col gap-3.5">
			<DetailCard><Stats items={d.stats} bar={d.bar} /></DetailCard>
			{#each d.groups as g (g.creatorId)}
				<DetailCard title={g.name} sub={g.handle} chips={g.chips}>
					{#snippet actions()}
						<a href={g.payoutHref} class="inline-flex h-9 items-center rounded-xl bg-white/6 px-3.5 text-[13px] font-bold whitespace-nowrap text-fg hover:bg-white/10">지급 건 열기</a>
					{/snippet}
					<SettleTable table={g.table} />
				</DetailCard>
			{/each}
		</div>
	{:else}
		<DetailHead back="/settle/rounds" backLabel="월 정산 목록으로" title="{month}월분 정산" />
		<div class="mt-8 flex flex-col items-center gap-4 rounded-[20px] border border-white/8 bg-white/3 px-5 py-14 text-center text-[14.5px] text-white/55">
			<p>{settle.onlyOct}</p>
			<Btn kind="ghost" onclick={() => history.back()}>돌아가기</Btn>
		</div>
	{/if}
</div>
