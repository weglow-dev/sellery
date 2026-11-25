<script lang="ts">
	import { copyText } from '$lib/copy';

	/** 작은 [복사] 버튼 — 목록 줄 · 상세의 값 옆(시안 24px 테두리 버튼) */
	let { text, what = '값', label = '복사' }: { text: string; what?: string; label?: string } = $props();
</script>

<button
	type="button"
	onclick={(e) => {
		e.stopPropagation();
		copyText(text, what);
	}}
	class="relative z-[1] flex h-6 shrink-0 items-center rounded-[7px] border border-white/16 px-2 text-[11.5px] font-bold whitespace-nowrap text-white/72 transition-colors hover:border-white/40 hover:text-fg"
	aria-label="{what} 복사">{label}</button
>
