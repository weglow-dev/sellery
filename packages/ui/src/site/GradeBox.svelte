<script lang="ts">
	/**
	 * 등급 박스 `.gradebox` / `.gradebox.sm` — 등급 아이콘 + 등급명 (web grade-box.tsx). grade 가 null 이면 아무것도 렌더하지 않는다.
	 * 아이콘과 글자 사이는 **CSS `gap`** 이 띄운다 — `.gradebox` 가 `inline-flex` 라 마크업에 공백을 두면
	 * 그 공백이 글자 쪽 flex 항목의 앞머리로 남아 `gap` 위에 더해진다(좌우 여백이 어긋나 보인다).
	 */
	import GradeIcon from './icons/GradeIcon.svelte';
	let { grade, sm = false, class: cls = '' }: { grade: string | null | undefined; sm?: boolean; class?: string } = $props();
</script>

{#if grade}<span class={['gradebox', sm ? 'sm' : '', cls].filter(Boolean).join(' ')} title="{grade} 등급"><GradeIcon {grade} />{grade}</span>{/if}
