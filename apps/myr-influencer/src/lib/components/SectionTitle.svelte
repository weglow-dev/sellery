<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 상세 화면의 소제목(고객 요청 · 처리 기준 · 처리 방법 …) */
	let { children }: { children: Snippet } = $props();
</script>

<h3 class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70 lg:text-[15px]">{@render children()}</h3>
