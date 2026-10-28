<script lang="ts">
	/** 오른쪽 화살표 라인 아이콘 — 히어로 힌트 · 2장 표 · 하단 CTA 가 같이 쓴다. */
	let { size = 16, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
