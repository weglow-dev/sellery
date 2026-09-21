<script lang="ts">
	/**
	 * 고객 셸 안의 오류 페이지 — web (customer)/not-found.tsx 와 동일 404 카드 (ux-spec §3.1.9).
	 * SvelteKit 은 미매치 경로·`error(404)` 를 전부 가장 가까운 +error.svelte 로 보내므로 web 의 `[...rest]` catch-all 은 필요 없다 (docs/monorepo-migration.md §3.4).
	 * 문구는 프로토타입 vStore 첫 줄 원문 · sellery.life 의 `/nope` 응답과 같다(title "셀러리" · robots noindex). 404 외 상태는 간단 문구.
	 */
	import { page } from '$app/state';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '셀러리' : `오류 — 셀러리`}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="store">
	<div class="card static">
		<div class="empty">{notFound ? '판매 페이지를 찾을 수 없습니다' : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
		<div style="text-align:center;padding-bottom:6px">
			<a href="/" class="btn ghost sm">← 셀러리 홈</a>
		</div>
	</div>
</div>
