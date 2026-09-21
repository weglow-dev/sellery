<script lang="ts">
	/**
	 * 루트 오류 페이지(셸 없음) — `(console)/+layout.server.ts` 자체가 실패했거나 `(demo)` 그룹이 프로덕션에서 404 를 던졌을 때만 온다.
	 * 콘솔 안의 404 는 `(console)/[...rest]` + `(console)/+error.svelte` 가 셸 안에서 그린다. (apps/influencer 와 동일)
	 */
	import '../app.css';
	import { page } from '$app/state';
	import { consolePath } from '@sellery/db/console-paths';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '페이지를 찾을 수 없습니다' : `오류 ${page.status}`} — 셀러리 파트너</title>
</svelte:head>

<main class="console-main">
	<div class="card static">
		<div class="empty">{notFound ? '페이지를 찾을 수 없습니다' : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
		<div style="text-align:center;padding-bottom:6px">
			<a href={consolePath('brand', '/home')} class="btn ghost sm">← 콘솔 홈</a>
		</div>
	</div>
</main>
