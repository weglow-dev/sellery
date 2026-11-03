<script lang="ts">
	import { TILE_ICONS, UI_ICONS } from '$lib/icons';

	/** 선 아이콘 — `id` 는 icons.ts 키. set 'ui'(24 viewBox · 기본) 또는 'tile'(제품 타일 48 viewBox) */
	let { id, size = 24, set = 'ui', sw = 2, class: cls = '' }: { id: string; size?: number; set?: 'ui' | 'tile'; sw?: number; class?: string } = $props();
	const html = $derived((set === 'tile' ? TILE_ICONS : UI_ICONS)[id] ?? '');
</script>

<svg
	width={size}
	height={size}
	viewBox={set === 'tile' ? '0 0 48 48' : '0 0 24 24'}
	fill="none"
	stroke="currentColor"
	stroke-width={sw}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class={cls}
>
	{@html html}
</svg>
