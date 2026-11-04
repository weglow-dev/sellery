<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 로그인 · 비밀번호 · 안내 화면 공용 틀 — 콘솔 셸(상단 내비 · 하단 탭) 없이 가운데 카드 하나. 서버에서 그려서 JS 없이도 동작한다 */
	let { title, sub = null, children }: { title: string; sub?: string | null; children: Snippet } = $props();
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg px-5 py-10">
	<div class="w-full max-w-[400px] animate-up-in">
		<div class="mb-7 flex items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-8 w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
		</div>
		<h1 class="text-[24px] leading-[1.3] font-extrabold tracking-[-0.03em]">{title}</h1>
		{#if sub}<p class="mt-2 text-[14px] leading-[1.6] text-white/60">{sub}</p>{/if}
		<div class="mt-7">{@render children()}</div>
	</div>
</div>
