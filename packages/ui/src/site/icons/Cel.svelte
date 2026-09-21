<script lang="ts">
	/** 인라인 셀러리 (15×17) — 인증 띠 · "인증 확인" · 푸터 · hero `ey` 앞. web icons.tsx CEL */
	import CeleryBody from './CeleryBody.svelte';
	let { class: cls = 'celic' }: { class?: string } = $props();
</script>

<svg class={cls} viewBox="0 0 28 32" width="15" height="17" role="img" aria-label="셀러리" fill="none" stroke="#2f5a1a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><CeleryBody /></svg>
