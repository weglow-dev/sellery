<script lang="ts">
	/** `<span class="p3d">{children}</span>` 하나 — 호스트 요소(.ph / .store-hero)는 부모가 만든다 (web tilt.tsx Tilt) */
	import type { Snippet } from 'svelte';
	import { tilt } from './tilt';
	let { class: cls = '', children }: { class?: string; children?: Snippet } = $props();
</script>

<span class={cls ? `p3d ${cls}` : 'p3d'} use:tilt>{@render children?.()}</span>
