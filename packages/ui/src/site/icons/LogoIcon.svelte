<script lang="ts">
	/** 로고 전용 일러스트 셀러리 (28×32). 크기·회전은 CSS `.celogo` 가 정한다 (워드마크 −14°). web icons.tsx LOGO_ICON */
	import CeleryBody from './CeleryBody.svelte';
	let { class: cls = 'celogo' }: { class?: string } = $props();
</script>

<svg class={cls} viewBox="0 0 28 32" aria-hidden="true" fill="none" stroke="#2f5a1a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><CeleryBody /></svg>
