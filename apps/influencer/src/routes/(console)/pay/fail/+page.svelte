<script lang="ts">
	/** failUrl 랜딩 카드 (고객 checkout/fail/+page.svelte 1:1) — 문의하기 · 상품 상세 · 다시 시도(/pay/<id> 또는 /pay/new) */
	import { COMPANY } from '@sellery/db/company';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const external = /^https?:\/\//.test(COMPANY.csUrl);
</script>

<svelte:head>
	<title>결제 실패 — 셀러리 파트너</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="card static">
	<h3 style="margin:0 0 8px">결제에 실패했어요</h3>
	<div class="notice danger" role="alert" style="margin:0 0 10px">{data.reason}</div>
	<div class="meta">
		결제는 진행되지 않았고 🥬 도 차감되지 않았어요 — 카드·간편결제로 다시 시도할 수 있어요.{#if data.productName}{' '}({data.productName}{data.amountText ? ` · ${data.amountText}` : ''}){/if}{#if data.orderId}{' '}<span style="font-family:var(--font-mono);font-size:11px">주문 {data.orderId}</span>{/if}
	</div>
	<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
		<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
		<a href={data.paths.product} class="btn">상품 상세</a>
		{#if data.paths.retry}<a href={data.paths.retry} class="btn pri">다시 시도</a>{/if}
	</div>
</section>
