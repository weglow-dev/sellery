<script lang="ts">
	/** /checkout — 서버 검증 결과에 따라 안내(.notice danger + ← 판매 페이지로) 또는 CheckoutClient (web checkout/page.tsx) */
	import CheckoutClient from './CheckoutClient.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>결제하기 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.checkout === null}
	<div class="store">
		<h2 class="pg">결제하기</h2>
		<div class="notice danger" role="alert">{data.blocked}</div>
		<a href={data.storeUrl} class="btn ghost sm">← 판매 페이지로</a>
	</div>
{:else}
	<CheckoutClient
		card={data.checkout.card}
		optionIndex={data.checkout.optionIndex}
		qty={data.checkout.qty}
		customerKey={data.checkout.customerKey}
		email={data.checkout.email}
		defaults={data.checkout.defaults}
		storeUrl={data.storeUrl}
	/>
{/if}
