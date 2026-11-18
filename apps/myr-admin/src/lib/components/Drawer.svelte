<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	/** 상세 서랍 — PC 는 오른쪽 520px 패널(목록은 흐리게 뒤에), 모바일은 전체 화면 시트. 하단 버튼 줄(footer)은 고정.
	 *  열림 상태는 주소(?id=)가 가진다 — 뒤로가기로 닫힌다 */
	let { title, onclose, head, footer, children }: { title: string; onclose: () => void; head?: Snippet; footer?: Snippet; children: Snippet } = $props();

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={key} />

<div class="fixed inset-0 z-50 flex justify-end">
	<button type="button" class="absolute inset-0 hidden animate-fade-in bg-black/55 lg:block" aria-label="닫기" onclick={onclose}></button>
	<div role="dialog" aria-modal="true" aria-label={title} class="relative flex h-dvh w-full animate-sheet flex-col bg-bg lg:max-w-[520px] lg:animate-drawer lg:border-l lg:border-white/8 lg:bg-panel">
		<div class="flex h-[60px] shrink-0 items-center gap-2 border-b border-white/7 px-3 lg:h-16 lg:px-5">
			<button type="button" onclick={onclose} class="flex h-11 w-11 items-center justify-center rounded-[14px] text-white/80 hover:bg-white/6 lg:hidden" aria-label="뒤로"><Icon id="back" size={22} /></button>
			<p class="min-w-0 flex-1 truncate text-[16px] font-extrabold lg:text-[17px]">{title}</p>
			<button type="button" onclick={onclose} class="hidden h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/6 lg:flex" aria-label="닫기"><Icon id="x" size={20} /></button>
		</div>
		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8 lg:px-6">
			{#if head}{@render head()}{/if}
			{@render children()}
		</div>
		{#if footer}
			<div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/7 px-5 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:px-6">{@render footer()}</div>
		{/if}
	</div>
</div>
