<script lang="ts">
	import { page } from '$app/state';
	import { settle } from '$lib/mock/settle.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import DetailHead from '$lib/components/DetailHead.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SettleTable from '$lib/components/SettleTable.svelte';
	import Stats from '$lib/components/Stats.svelte';

	/** 월 정산 회차 상세 — docs/myr-admin-screens.md §10-3. 오른쪽 패널 없는 넓은 화면: 요약 숫자 + 지급 진행 막대 → 크리에이터별 묶음("지급 ₩…" 흰 칩 · 지급 건 상태 · 자동 이체 날짜 · [지급 건 열기] → 지급 건 상세 페이지) → 상품 줄 표(누르면 주문 내역 · 정산금 펼침).
	 *  보류 줄 · 보류 해제 줄 표시 · 지급 건 상태 칩은 서버 값 */
	const month = $derived(page.params.month ?? '');
	const d = $derived(settle.round(month));
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	{#if d}
		<!-- 머리(시안) — 뒤로 · "정산 · 월 정산" · 제목 · 오른쪽 계산 시각 -->
		<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:min-h-[52px] lg:flex-nowrap">
			<a href="/settle/rounds" aria-label="월 정산 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
			<div class="min-w-0 flex-1 lg:flex-none">
				<p class="text-[12.5px] font-semibold text-white/50">정산 · 월 정산</p>
				<h1 class="truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{d.title}</h1>
			</div>
			<span class="hidden flex-1 lg:block"></span>
			<span class="w-full text-[13px] text-white/50 tabular-nums lg:w-auto lg:text-[14px]">{d.sub}</span>
		</div>
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
