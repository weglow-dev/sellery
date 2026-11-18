<script lang="ts">
	import { UI_ICONS } from '$lib/icons';

	/** 선 아이콘 — `id` 는 icons.ts 키 (크리에이터 콘솔 Icon 과 같은 모양) */
	let { id, size = 24, sw = 2, class: cls = '' }: { id: string; size?: number; sw?: number; class?: string } = $props();
	const html = $derived(UI_ICONS[id] ?? '');
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={cls}>
	{@html html}
</svg>
