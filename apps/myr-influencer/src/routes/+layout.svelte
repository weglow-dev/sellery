<script lang="ts">
	import '../app.css';

	/** 루트 — 스타일만. 콘솔 화면의 셸(상단 내비 · 하단 탭 · 토스트)은 `(console)/+layout.svelte`, 로그인 · 비밀번호 화면은 셸 없이 단독 */
	let { children } = $props();
</script>

<!-- noindex 는 app.html(정적 HTML) + vercel.json 헤더에 있다 -->
<svelte:head>
	<title>MYR Creator — 내 제품 · CS 관리</title>
</svelte:head>

{@render children()}
