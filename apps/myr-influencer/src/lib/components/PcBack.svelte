<script lang="ts">
	import Icon from './Icon.svelte';

	/** PC 화면 제목 왼쪽의 테두리 [뒤로] 40px (CS 상세 · 상품 등록) */
	let { onclick, label = '뒤로' }: { onclick: () => void; label?: string } = $props();
</script>

<button type="button" {onclick} aria-label={label} class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-fg transition-colors hover:border-white/30">
	<Icon id="back" size={18} sw={2.2} />
</button>
