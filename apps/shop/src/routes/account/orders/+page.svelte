<script lang="ts">
	/**
	 * 내 주문 — web account/orders/page.tsx 1:1. 미로그인 카드 / 목록(OrderRow) / 계정 카드(로그아웃). 환불 뒤 `invalidateAll()` 로 칩 '환불 완료'.
	 */
	import { invalidateAll } from '$app/navigation';
	import { md } from '@sellery/db/dates';
	import { KAKAO_ICON as KakaoIcon, OrderRow, SignOutButton } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const LOGIN_HREF = `/login?next=${encodeURIComponent('/account/orders')}`;
	const refresh = () => invalidateAll();
</script>

<svelte:head>
	<title>내 주문 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !data.user}
	<h2 class="pg">내 주문</h2>
	<div class="card static" style="text-align:center;padding:34px">
		<b>카카오 로그인</b>하면 주문·배송·환불을 한곳에서 볼 수 있어요
		<div class="btnrow" style="justify-content:center;margin-top:14px">
			<a href={LOGIN_HREF} class="btn sm kakao"><KakaoIcon /> 카카오 로그인</a>
		</div>
	</div>
{:else}
	<h2 class="pg">내 주문 <small>{data.user.name}님 · {data.orders.length}건</small></h2>

	{#if data.orders.length}
		<div class="listcard">
			{#each data.orders as o (o.id)}
				<OrderRow order={o} settings={data.settings} onRefreshed={refresh} />
			{/each}
		</div>
	{:else}
		<div class="card static" style="padding:30px;text-align:center;color:var(--color-mute)">아직 주문이 없어요 — <a href="/" class="btn sm ghost">진행 중인 판매 보기</a></div>
	{/if}

	<div class="card static" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
		<div style="display:flex;align-items:center;gap:10px;min-width:0">
			<span class="kv-av" style="width:34px;height:34px;font-size:14px" aria-hidden="true">{data.user.name.slice(0, 1)}</span>
			<div style="min-width:0">
				<b>{data.user.name}</b>
				<div class="meta">{data.user.email}{data.user.email ? ' · ' : ''}카카오 계정{data.user.joined ? ` · ${md(data.user.joined)} 가입` : ''}</div>
			</div>
		</div>
		<SignOutButton class="sm ghost" />
	</div>
{/if}
