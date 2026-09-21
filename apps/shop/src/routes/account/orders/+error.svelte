<script lang="ts">
	/**
	 * /account/orders/[code] — 타인 주문·없는 주문번호 (`error(404)`, app-plan §6.1 · web account/orders/not-found.tsx).
	 * 404 외 상태(주문 조회 실패 등)는 간단 문구.
	 */
	import { page } from '$app/state';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '주문을 찾을 수 없습니다' : '오류'} — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="store">
	<div class="card static">
		<div class="empty">{notFound ? '주문을 찾을 수 없습니다' : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
		<div style="text-align:center;padding-bottom:6px">
			<a href="/account/orders" class="btn ghost sm">← 내 주문</a>
		</div>
	</div>
</div>
