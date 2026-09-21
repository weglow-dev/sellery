<script lang="ts">
	/** 법적 고지 블록 1개 — p · ol · ul · table · note (web legal-doc.tsx Block) */
	import type { LegalBlock } from '@sellery/db/legal';
	import LegalInline from './LegalInline.svelte';
	let { block }: { block: LegalBlock } = $props();
</script>

{#if block.type === 'p'}
	<p><LegalInline text={block.text} /></p>
{:else if block.type === 'ol'}
	<ol>{#each block.items as t, i (i)}<li><LegalInline text={t} /></li>{/each}</ol>
{:else if block.type === 'ul'}
	<ul>{#each block.items as t, i (i)}<li><LegalInline text={t} /></li>{/each}</ul>
{:else if block.type === 'table'}
	<div class="legal-tblw">
		<table>
			{#if block.caption}<caption>{block.caption}</caption>{/if}
			<thead>
				<tr>{#each block.head as h, i (i)}<th scope="col"><LegalInline text={h} /></th>{/each}</tr>
			</thead>
			<tbody>
				{#each block.rows as row, ri (ri)}<tr>{#each row as cell, ci (ci)}<td><LegalInline text={cell} /></td>{/each}</tr>{/each}
			</tbody>
		</table>
	</div>
{:else if block.type === 'note'}
	<div class="notice"><LegalInline text={block.text} /></div>
{/if}
