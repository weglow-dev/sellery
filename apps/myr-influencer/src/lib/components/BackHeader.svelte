<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goBack } from '$lib/nav';
	import Icon from './Icon.svelte';

	/** 모바일 60px 헤더 — [뒤로] · 제목 · 오른쪽 보조. onback 이 없으면 브라우저 뒤로(앱 밖이면 fallback). PC(lg) 에서는 숨기고 화면이 자기 h1 을 그린다 */
	let { title, fallback = '/', onback, right }: { title: string; fallback?: string; onback?: () => void; right?: Snippet } = $props();
</script>

<div class="flex h-[60px] shrink-0 items-center gap-2 pr-5 pl-1.5 lg:hidden">
	<button type="button" onclick={() => (onback ? onback() : goBack(fallback))} aria-label="뒤로" class="flex h-11 w-11 items-center justify-center text-fg">
		<Icon id="back" size={22} sw={2.2} />
	</button>
	<span class="flex-1 truncate text-[16px] font-bold">{title}</span>
	{#if right}{@render right()}{/if}
</div>
