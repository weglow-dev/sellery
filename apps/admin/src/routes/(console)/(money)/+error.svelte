<script lang="ts">
	/**
	 * "정산 · 돈" 그룹의 오류 페이지 — apps/brand `(console)/+error.svelte` 와 같은 골격. 없는 캠페인·주문·문의 코드(`error(404)`)가 여기로 온다.
	 * `(console)/+error.svelte` 는 셸 담당자 몫이라 만들지 않는다 — 이 그룹 안에서만 잡는다.
	 */
	import { page } from '$app/state';
	import { base } from '$app/paths';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '페이지를 찾을 수 없습니다' : `오류 ${page.status}`} — 셀러리 관리자</title>
</svelte:head>

<div class="card static">
	<div class="empty">{notFound ? (page.error?.message ?? '페이지를 찾을 수 없습니다') : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
	<div style="text-align:center;padding-bottom:6px">
		<a href="{base}/settle" class="btn ghost sm">← 정산</a>
		<a href="{base}/home" class="btn ghost sm">홈</a>
	</div>
</div>
