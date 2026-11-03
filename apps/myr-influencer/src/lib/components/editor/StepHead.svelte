<script lang="ts">
	import Icon from '../Icon.svelte';

	/** 에디터 단계 머리 — "01 · 기본 정보" · 큰 제목(\n 줄바꿈) · 설명 · 샵 상세페이지 위치 칩 */
	let { n, name, title, desc, where }: { n: number; name: string; title: string; desc: string; where?: string } = $props();
	const lines = $derived(title.split('\n'));
</script>

<p class="text-[13px] font-bold text-accent">{String(n).padStart(2, '0')} · {name}</p>
<h1 class="mt-2 text-[26px] leading-[1.3] font-extrabold tracking-[-0.025em]">
	{#each lines as line, i (i)}{#if i}<br />{/if}{line}{/each}
</h1>
<p class="mt-2.5 text-[14px] text-white/60">{desc}</p>
{#if where}
	<div class="mt-[18px] inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/55">
		<Icon id="frame" size={12} sw={2.4} />샵 상세페이지 · {where}
	</div>
{/if}
