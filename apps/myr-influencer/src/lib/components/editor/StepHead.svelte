<script lang="ts">
	import Icon from '../Icon.svelte';

	/** 에디터 단계 머리 — "01 · 기본 정보" · 큰 제목 · 설명 · 샵 상세페이지 위치 칩.
	 *  제목의 \n 은 모바일에서만 줄바꿈이고 PC(lg~)에서는 한 줄(공백)로 읽힌다 (디자인 PC 시안 제목은 한 줄) */
	let { n, name, title, desc, where }: { n: number; name: string; title: string; desc: string; where?: string } = $props();
	const lines = $derived(title.split('\n'));
</script>

<p class="text-[13px] font-bold text-accent">{String(n).padStart(2, '0')} · {name}</p>
<h1 class="mt-2 text-[26px] leading-[1.3] font-extrabold tracking-[-0.025em] lg:text-[30px]">
	{#each lines as line, i (i)}{#if i}<br class="lg:hidden" /><span class="hidden lg:inline">{' '}</span>{/if}{line}{/each}
</h1>
<p class="mt-2.5 text-[14px] text-white/60 lg:text-[15px]">{desc}</p>
{#if where}
	<div class="mt-[18px] inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-white/55">
		<Icon id="frame" size={12} sw={2.4} />샵 상세페이지 · {where}
	</div>
{/if}
