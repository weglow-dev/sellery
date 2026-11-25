<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 상세 · 심사 오른쪽 패널의 큰 버튼(52px · 시안 상세 버튼 줄 · sm 46px = 모바일 "관리" 칸) — 줄 안에서 똑같이 나눠 가진다.
	 *  primary(주황) · ghost(옅은 배경) · danger(빨강 옅게 — 되돌릴 수 없는 동작의 첫 클릭) · solidRed(빨강 채움 — 두 번째 클릭) · 잠김은 disabled */
	let { tone = 'ghost', sm = false, disabled = false, onclick, children }: { tone?: 'primary' | 'ghost' | 'danger' | 'solidRed'; sm?: boolean; disabled?: boolean; onclick?: () => void; children: Snippet } = $props();
	const T = {
		primary: 'border-accent bg-accent text-bg',
		ghost: 'border-white/10 bg-white/6 text-fg',
		danger: 'border-danger/28 bg-danger/10 text-danger-fg',
		solidRed: 'border-danger bg-danger text-bg'
	};
</script>

<button
	type="button"
	{disabled}
	{onclick}
	class="min-w-0 flex-1 border px-3 font-bold {sm ? 'h-[46px] rounded-[14px] text-[14px]' : 'h-[52px] rounded-2xl text-[15px]'} whitespace-nowrap transition hover:brightness-110 disabled:cursor-default disabled:border-white/6 disabled:bg-white/4 disabled:text-white/28 disabled:hover:brightness-100 {T[tone]}"
>
	{@render children()}
</button>
