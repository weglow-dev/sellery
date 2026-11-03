<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 화면 바닥 행동 버튼 줄(CS 승인/반려 · 에디터 임시저장/다음) — 셸 안 보통 흐름(스크롤 영역 아래) */
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex shrink-0 gap-2.5 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
	{@render children()}
</div>
