<script lang="ts">
	/** `/alerts/off` — 오픈 알림 수신거부 완료 안내 (0043). 토큰이 틀려도 같은 화면(열거 방지 · load 주석 참고) */
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>오픈 알림 수신거부 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="store">
	<div class="card static">
		<h3>오픈 알림을 끊었어요</h3>
		<div class="meta">
			앞으로 이 판매의 오픈 알림 메일을 보내지 않습니다. 주문 확인 · 배송 시작 · 환불 완료 같은
			주문 관련 메일은 거래 안내라 계속 보내드려요.
		</div>
		<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
			<a href="/" class="btn">셀러리 홈</a>
			{#if data.campaignCode}
				<a href="/c/{data.campaignCode}" class="btn pri">판매 페이지 보기</a>
			{/if}
		</div>
	</div>
</div>
