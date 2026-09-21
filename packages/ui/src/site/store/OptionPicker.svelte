<script lang="ts">
	/**
	 * 옵션 선택 `.opts` / `.opt` (ux-spec §1.4 · §3.1.2 · web store/option-picker.tsx).
	 * 각 행 `<span>{n}</span><b>₩{price}</b>`, 선택 `.on`. 순서·가격·이름은 RPC `product.options` 원본 순서.
	 */
	import { won, type ResolvedOption } from '@sellery/db/campaign';
	let { options, value, onChange }: { options: ResolvedOption[]; value: number; onChange: (i: number) => void } = $props();
</script>

<div class="opts" role="radiogroup" aria-label="옵션 선택">
	{#each options as o, i (`${i}:${o.n}`)}
		<button type="button" role="radio" aria-checked={i === value} class={i === value ? 'opt on' : 'opt'} onclick={() => onChange(i)}><span>{o.n}</span><b>{won(o.price)}</b></button>
	{/each}
</div>
