<script lang="ts" generics="T extends string">
	/** 필터 칩 — 이름 + 개수. CS 관리 · 내 제품 목록 상단. 모바일은 가로 스크롤 한 줄, PC 는 줄바꿈 + 40px 칩 */
	let { tabs, value = $bindable(), label }: { tabs: { id: T; name: string; count: number }[]; value: T; label: string } = $props();
</script>

<div class="no-bar flex shrink-0 gap-2 overflow-x-auto px-5 pt-1 pb-3 lg:mt-5 lg:flex-wrap lg:overflow-visible lg:p-0" role="group" aria-label={label}>
	{#each tabs as t (t.id)}
		{@const on = value === t.id}
		<button
			type="button"
			aria-pressed={on}
			onclick={() => (value = t.id)}
			class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-[9px] text-[13px] font-bold transition-all lg:h-10 lg:px-4 lg:py-0 lg:text-[14px] {on ? 'border-accent bg-accent text-bg' : 'border-white/10 text-white/80 lg:hover:border-white/30'}"
		>
			{t.name}
			<span class="rounded-full px-1.5 py-px text-[11px] font-extrabold tabular-nums lg:px-[7px] {on ? 'bg-bg/18 text-bg' : 'bg-white/8 text-white/70'}">{t.count}</span>
		</button>
	{/each}
</div>
