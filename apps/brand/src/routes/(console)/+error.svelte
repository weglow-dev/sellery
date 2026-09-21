<script lang="ts">
	/**
	 * 콘솔 셸 안의 오류 페이지 — apps/influencer `(console)/+error.svelte` 와 동일 (docs/brand-console-plan.md §2).
	 * `[...rest]/+page.server.ts` 의 error(404)(아직 없는 탭 화면 `/orders` `/my` 포함) 와 남의 상품·캠페인 코드(`getBrandProduct` · `getBrandCampaign` null)가 여기로 온다 — 셸(상단 바 · 하단 탭) 안에서 렌더된다.
	 */
	import { page } from '$app/state';
	import { consolePath } from '@sellery/db/console-paths';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '페이지를 찾을 수 없습니다' : `오류 ${page.status}`} — 셀러리 파트너</title>
</svelte:head>

<div class="card static">
	<div class="empty">{notFound ? '페이지를 찾을 수 없습니다' : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
	<div style="text-align:center;padding-bottom:6px">
		<a href={consolePath('brand', '/home')} class="btn ghost sm">← 콘솔 홈</a>
	</div>
</div>
