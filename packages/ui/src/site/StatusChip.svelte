<script lang="ts" module>
	/**
	 * 상태 칩 `.st` — Mono 10.5px 700 · 앞 6px 점 (web status-chip.tsx).
	 *   green(결제 완료 · 유효) · gray(환불 완료) · blue · amber · red · live(잉크/라임 + "LIVE" 점멸)
	 * @sellery/db order-status 의 StatusTone 과 호환되는 상위 집합.
	 */
	export type ChipTone = 'green' | 'gray' | 'blue' | 'amber' | 'red' | 'live';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	let { tone, class: cls = '', title, children }: { tone: ChipTone; class?: string; title?: string; children: Snippet } = $props();
</script>

<span class={cls ? `st ${tone} ${cls}` : `st ${tone}`} {title}>{@render children()}</span>
