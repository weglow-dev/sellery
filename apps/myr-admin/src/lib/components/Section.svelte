<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 상세 서랍 안 구획 — 소제목 + 내용 (크리에이터 콘솔 SectionTitle 과 같은 크기) */
	let { title, aside, children }: { title: string; aside?: Snippet; children: Snippet } = $props();
</script>

<section class="mt-6">
	<div class="mb-2.5 flex items-center justify-between gap-3">
		<h3 class="text-[14px] font-extrabold text-white/70 lg:text-[15px]">{title}</h3>
		{#if aside}<div class="text-[12px] text-white/55">{@render aside()}</div>{/if}
	</div>
	{@render children()}
</section>
