<script lang="ts">
	import { ICONS, TAB_ICONS } from '$lib/icons';

	/** 선 아이콘 — `id` 는 icons.ts 키. 48 viewBox(기본) 또는 탭바 24 viewBox(`tab`) */
	let { id, size = 24, tab = false, class: cls = '' }: { id: string; size?: number; tab?: boolean; class?: string } = $props();
	const html = $derived((tab ? TAB_ICONS : ICONS)[id] ?? '');
</script>

<svg
	width={size}
	height={size}
	viewBox={tab ? '0 0 24 24' : '0 0 48 48'}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class={cls}
>
	{@html html}
</svg>
