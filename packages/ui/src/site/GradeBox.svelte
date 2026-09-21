<script lang="ts">
	/** 등급 박스 `.gradebox` / `.gradebox.sm` — 등급 아이콘 + 등급명 (web grade-box.tsx). grade 가 null 이면 아무것도 렌더하지 않는다. */
	import GradeIcon from './icons/GradeIcon.svelte';
	let { grade, sm = false, class: cls = '' }: { grade: string | null | undefined; sm?: boolean; class?: string } = $props();
</script>

{#if grade}<span class={['gradebox', sm ? 'sm' : '', cls].filter(Boolean).join(' ')} title="{grade} 등급"><GradeIcon {grade} /> {grade}</span>{/if}
