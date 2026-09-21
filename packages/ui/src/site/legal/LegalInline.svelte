<script lang="ts">
	/** 문자열 한 줄 → 텍스트 + 링크 (inline.ts inlineParts). `{@html}` 을 쓰지 않는다. */
	import { inlineParts } from './inline';
	let { text }: { text: string } = $props();
	const parts = $derived(inlineParts(text));
</script>

{#each parts as p, i (i)}{#if p.kind === 'text'}{p.text}{:else if p.external}<a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a>{:else}<a href={p.href}>{p.label}</a>{/if}{/each}
