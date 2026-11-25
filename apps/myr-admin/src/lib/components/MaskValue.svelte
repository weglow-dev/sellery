<script lang="ts">
	import { app } from '$lib/state.svelte';

	/** 민감 정보 — 가린 값 + [보기] (§1-2). 보면 원문을 6초 보여 주고 "열람 기록이 남아요" 토스트 · [가리기]로 바로 가린다 */
	let { masked, raw, what = '값' }: { masked: string; raw: string; what?: string } = $props();
	let on = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		clearTimeout(timer);
		if (on) return (on = false);
		on = true;
		app.showToast('열람 기록이 남아요');
		timer = setTimeout(() => (on = false), 6000);
	}
</script>

<span class="inline-flex min-w-0 items-center gap-2">
	<span class="min-w-0 truncate tabular-nums">{on ? raw : masked}</span>
	<button type="button" onclick={toggle} class="relative z-[1] flex h-6 shrink-0 items-center rounded-[7px] border border-white/16 px-2 text-[11.5px] font-bold whitespace-nowrap text-white/72 transition-colors hover:border-white/40 hover:text-fg" aria-label="{what} {on ? '가리기' : '보기'}">{on ? '가리기' : '보기'}</button>
</span>
