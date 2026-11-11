<script lang="ts">
	/** 금액을 서버에 묻는 동안 숫자 자리에 두는 작은 스피너 — 크기 · 색은 놓인 글자를 따라간다(1em · currentColor).
	 *  화면 읽기 프로그램에는 label 을 읽어 준다. 움직임 줄이기 설정이면 돌지 않고 천천히 깜빡인다 */
	let { label = '금액 확인 중', class: cls = '' }: { label?: string; class?: string } = $props();
</script>

<span
	role="status"
	aria-label={label}
	class="inline-block h-[1em] w-[1em] animate-spin rounded-full border-2 border-current/25 border-t-current align-[-0.125em] motion-reduce:animate-pulse {cls}"
></span>
