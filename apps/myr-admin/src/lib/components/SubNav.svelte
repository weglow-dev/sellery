<script lang="ts">
	/** 메뉴 안 화면 고르기(시안 subs) — "주문 목록 · 송장 일괄 입력 · 배송 완료 예외" · "교환 · 환불 · 고객 문의" · "제조 원장 · 월 정산".
	 *  둥근 상자 안 세그먼트 · 고른 것은 #2a2c33 · 건수 배지(주황). PC 는 칸 150px 이상, 모바일은 가로를 나눠 채운다 */
	let { items, value, label }: { items: { key: string; label: string; href: string; n?: number }[]; value: string; label: string } = $props();
</script>

<nav class="flex rounded-2xl bg-white/5 p-1 lg:inline-flex" aria-label={label}>
	{#each items as it (it.key)}
		{@const on = it.key === value}
		<a href={it.href} aria-current={on ? 'page' : undefined} class="flex h-[42px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1 text-[14px] font-bold whitespace-nowrap transition-colors lg:h-11 lg:min-w-[150px] lg:flex-none lg:px-5 lg:text-[15px] {on ? 'bg-[#2a2c33] text-fg' : 'text-white/55 hover:text-white/80'}">
			{it.label}
			{#if it.n}<span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[11px] font-extrabold tabular-nums {on ? 'bg-accent text-bg' : 'bg-accent/20 text-accent'}">{it.n}</span>{/if}
		</a>
	{/each}
</nav>
