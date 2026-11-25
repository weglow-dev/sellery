<script lang="ts">
	/** 샵 상세 미리보기 한 섹션 내용 — 모양은 서버(목)가 정한다(시안 상품 심사).
	 *  note 레시피 노트 · story 이야기(왜 만들었나요 · 섭취법) · rows 표(성분 · 제품 정보 · 그 밖의 기본 정보) · faq 질문 · empty 빈 칸(샵에서 숨김).
	 *  changed 줄은 주황 배경(수정 심사의 수정본 쪽) */
	type Item = { h: string; t: string; changed: boolean };
	let { kind, head, items, ing = false, noteTitle = '' }: { kind: 'note' | 'story' | 'rows' | 'faq' | 'empty'; head: string; items: Item[]; ing?: boolean; noteTitle?: string } = $props();
</script>

{#if kind === 'note'}
	<div class="rounded-[18px] border border-accent/20 bg-accent/7 p-5">
		<p class="text-[13px] font-extrabold text-accent">{noteTitle}</p>
		{#each items as it, n (n)}<p class="mt-3 text-[16px] leading-[1.65] font-medium">{it.t}</p>{/each}
	</div>
{:else}
	<p class="text-[12.5px] font-extrabold tracking-[0.01em] text-accent">{head}</p>
	{#if kind === 'story'}
		{#each items as it, n (n)}
			{#if it.h}<p class="mt-2.5 text-[19px] leading-[1.35] font-extrabold tracking-[-0.02em]">{it.h}</p>{/if}
			<p class="mt-2.5 rounded-[10px] text-[15px] leading-[1.75] text-white/80 {it.changed ? 'bg-accent/14 px-2.5 py-1.5' : ''}">{it.t}</p>
		{/each}
	{:else if kind === 'rows'}
		<div class="mt-3 rounded-2xl bg-white/4 px-4 py-0.5">
			{#each items as it, n (n)}
				<div class="-mx-2 flex items-baseline justify-between gap-4 rounded-[10px] px-2 py-[13px] {n ? 'border-t border-white/7' : ''} {it.changed ? 'bg-accent/14' : ''}">
					<span class="max-w-[60%] shrink-0 text-[14.5px] {ing ? 'font-bold text-fg' : 'font-medium text-white/55'}">{it.h}</span>
					<span class="min-w-0 text-right text-[14px] leading-[1.5] {ing ? 'font-medium text-white/60' : 'font-bold text-fg'}">{it.t}</span>
				</div>
			{/each}
		</div>
	{:else if kind === 'faq'}
		<div class="mt-3 flex flex-col gap-2">
			{#each items as it, n (n)}
				<div class="rounded-[14px] px-4 py-3.5 {it.changed ? 'bg-accent/12' : 'bg-white/4'}">
					<p class="flex gap-2 text-[14.5px] leading-[1.5] font-bold"><span class="shrink-0 text-accent">Q</span><span>{it.h}</span></p>
					<p class="mt-1.5 pl-5 text-[14px] leading-[1.6] text-white/70">{it.t}</p>
				</div>
			{/each}
		</div>
	{:else}
		<p class="mt-3 rounded-2xl border border-dashed border-white/14 p-[18px] text-center text-[13.5px] text-white/40">비어 있음 (샵에서 숨김)</p>
	{/if}
{/if}
