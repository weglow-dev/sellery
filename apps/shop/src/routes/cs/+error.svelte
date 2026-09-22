<script lang="ts">
	/**
	 * /cs/new · /cs/[code] — 없는 캠페인 · 토큰/회원 어느 쪽도 맞지 않는 문의 코드 (`error(404)`, docs/brand-console-plan.md §6 행 4 (g)).
	 * 코드·토큰 불일치를 구분하지 않는다 — 문구는 하나. 404 외 상태는 간단 문구. account/orders/+error.svelte 와 같은 카드.
	 */
	import { page } from '$app/state';
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? '문의를 찾을 수 없습니다' : '오류'} — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="store">
	<div class="card static">
		<div class="empty">{notFound ? page.error?.message || '문의를 찾을 수 없습니다' : `문제가 생겼어요 (${page.status})${page.error?.message ? ` — ${page.error.message}` : ''}`}</div>
		<div class="meta" style="text-align:center;margin:0 0 12px">비회원 문의는 접수한 기기에서 90일간 열려요 — 다른 기기라면 카카오 로그인 후 내 주문에서 확인하거나 새로 접수해주세요.</div>
		<div style="text-align:center;padding-bottom:6px">
			<a href="/account/orders" class="btn ghost sm">← 내 주문</a>
			<a href="/" class="btn ghost sm">셀러리 홈</a>
		</div>
	</div>
</div>
