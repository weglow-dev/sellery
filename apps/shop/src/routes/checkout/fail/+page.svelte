<script lang="ts">
	/** failUrl 랜딩 카드 (web checkout/fail/page.tsx) — 문의하기(COMPANY.csUrl) · 판매 페이지로 · 다시 시도 */
	import { COMPANY } from '@sellery/db/company';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const external = /^https?:\/\//.test(COMPANY.csUrl);
</script>

<svelte:head>
	<title>결제 실패 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="store">
	<div class="card static">
		<h3>결제에 실패했어요</h3>
		<div class="notice danger" role="alert" style="margin:0 0 10px">{data.reason}</div>
		<div class="meta">
			결제는 진행되지 않았습니다 — 카드·간편결제로 다시 시도할 수 있어요.{#if data.orderId}{' '}<span style="font-family:var(--font-mono);font-size:11px">주문 {data.orderId}</span>{/if}
		</div>
		<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
			<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
			<a href={data.storeHref} class="btn">판매 페이지로</a>
			{#if data.retryHref}<a href={data.retryHref} class="btn pri">다시 시도</a>{/if}
		</div>
	</div>
</div>
