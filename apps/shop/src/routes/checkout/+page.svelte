<script lang="ts">
	/**
	 * /checkout — 서버 검증 결과에 따라 안내(.notice danger + ← 판매 페이지로) · 로그인/비회원 선택 카드(0021) · CheckoutClient (web checkout/page.tsx)
	 */
	import { KAKAO_ICON as KakaoIcon } from '@sellery/ui/site';
	import CheckoutClient from './CheckoutClient.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>결제하기 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.blocked}
	<div class="store">
		<h2 class="pg">결제하기</h2>
		<div class="notice danger" role="alert">{data.blocked}</div>
		<a href={data.storeUrl} class="btn ghost sm">← 판매 페이지로</a>
	</div>
{:else if data.choose}
	<div class="store">
		<h2 class="pg">결제하기 <small>{data.choose.product} · {data.choose.option} × {data.choose.qty}</small></h2>
		<div class="card static" style="max-width:520px;margin:0 auto;text-align:center;padding:26px 22px">
			<h3 style="margin:0 0 6px">어떻게 구매할까요?</h3>
			<p class="meta" style="margin:0 0 16px">카카오 로그인 없이도 구매할 수 있어요. 비회원 주문은 <b>주문번호 + 연락처</b>로 조회·환불·문의할 수 있습니다.</p>
			<div style="display:flex;flex-direction:column;gap:10px">
				<a href={data.choose.loginHref} class="btn kakao" style="justify-content:center"><KakaoIcon /> 카카오로 로그인하고 구매</a>
				<a href={data.choose.guestHref} class="btn pri" style="justify-content:center" data-testid="guest-checkout">비회원으로 구매</a>
			</div>
			<p class="meta" style="margin:14px 0 0;font-size:11.5px">로그인하면 주문·배송·환불을 「내 주문」에서 한곳에 모아 볼 수 있어요</p>
			<div style="margin-top:14px"><a href={data.storeUrl} class="btn ghost sm">← 판매 페이지로</a></div>
		</div>
	</div>
{:else if data.checkout}
	<CheckoutClient
		card={data.checkout.card}
		optionIndex={data.checkout.optionIndex}
		qty={data.checkout.qty}
		guest={data.checkout.guest}
		customerKey={data.checkout.customerKey}
		email={data.checkout.email}
		defaults={data.checkout.defaults}
		storeUrl={data.storeUrl}
	/>
{/if}
