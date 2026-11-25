<script lang="ts" generics="T extends string">
	/** 상태 탭 — 이름 + 건수 (크리에이터 콘솔 FilterTabs 와 같은 칩). 모바일은 가로 스크롤 한 줄 · 36px 칩(시안 "MYR Admin"), PC 는 40px 칩.
	 *  hot = 처리할 게 있는 탭(빨간 숫자). onpick 은 주소(?tab=)를 바꾸는 쪽이 받는다 */
	let { tabs, value, label, onpick }: { tabs: { id: T; name: string; count: number; hot?: boolean }[]; value: T; label: string; onpick: (id: T) => void } = $props();
</script>

<div class="no-bar -mx-5 flex shrink-0 gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0" role="group" aria-label={label}>
	{#each tabs as t (t.id)}
		{@const on = value === t.id}
		<button
			type="button"
			aria-pressed={on}
			onclick={() => onpick(t.id)}
			class="flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold transition-colors lg:h-10 lg:px-4 lg:text-[14px] {on ? 'border-accent bg-accent text-bg' : 'border-white/10 text-white/80 hover:border-white/30'}"
		>
			{t.name}
			<span class="rounded-full px-[7px] py-px text-[11px] font-extrabold tabular-nums {on ? 'bg-bg/18 text-bg' : t.hot && t.count ? 'bg-danger/18 text-danger-fg' : 'bg-white/8 text-white/70'}">{t.count}</span>
		</button>
	{/each}
</div>
