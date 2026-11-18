<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 버튼 — primary(주황 채움) · danger(빨강 채움 · 되돌릴 수 없는 동작의 두 번째 클릭) · line(테두리) · ghost(옅은 배경).
	 *  모바일 터치 영역 44px · PC 는 sm(36px) 을 표 안에서 */
	let {
		kind = 'line',
		sm = false,
		full = false,
		disabled = false,
		type = 'button',
		onclick,
		children
	}: { kind?: 'primary' | 'danger' | 'line' | 'ghost'; sm?: boolean; full?: boolean; disabled?: boolean; type?: 'button' | 'submit'; onclick?: (e: MouseEvent) => void; children: Snippet } = $props();
	const K = {
		primary: 'bg-accent text-bg hover:brightness-110',
		danger: 'bg-danger text-bg hover:brightness-110',
		line: 'border border-white/14 text-fg hover:border-white/35',
		ghost: 'bg-white/6 text-fg hover:bg-white/10'
	};
</script>

<button
	{type}
	{disabled}
	onclick={(e) => {
		e.stopPropagation();
		onclick?.(e);
	}}
	class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 {sm ? 'h-11 px-3.5 text-[13px] lg:h-9' : 'h-11 px-4 text-[14px] lg:h-11'} {full ? 'w-full' : ''} {K[kind]}"
>
	{@render children()}
</button>
