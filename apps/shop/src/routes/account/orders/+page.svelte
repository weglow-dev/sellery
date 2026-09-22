<script lang="ts">
	/**
	 * 내 주문 — web account/orders/page.tsx 1:1. 미로그인 카드 / 목록(OrderRow) / 문의 내역(4단계 — 판매자 문의 행 → `/cs/<code>`) / 계정 카드(로그아웃). 환불 뒤 `invalidateAll()` 로 칩 '환불 완료'.
	 */
	import { invalidateAll } from '$app/navigation';
	import { md } from '@sellery/db/dates';
	import { KAKAO_ICON as KakaoIcon, OrderRow, ProductIcon, SignOutButton, StatusChip } from '@sellery/ui/site';
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

	<div class="sec" style="margin-top:18px">문의 내역 {#if data.cs.length}<span class="badge" style="position:static;display:inline-block">{data.cs.length}</span>{/if}</div>
	{#if data.cs.length}
		<div class="listcard cs-list">
			{#each data.cs as x (x.code)}
				<a href={x.href} class="rowitem">
					{#if x.product}<ProductIcon thumbUrl={x.product.thumb_url} emoji={x.product.emoji} size={38} />{/if}
					<div class="grow" style="min-width:160px">
						<div class="nm">{x.product?.name ?? '문의'} <span class="chip">{x.type}</span></div>
						<div class="sub"><span style="font-family:var(--font-mono)">{x.code.toUpperCase()}</span>{#if x.order_code}<span>· 주문 <span style="font-family:var(--font-mono)">{x.order_code.toUpperCase()}</span></span>{/if}<span>· {x.brand_name}</span><span>· {md(x.last_message_at)}</span></div>
						{#if x.last_preview}<div class="sub" style="margin-top:3px;color:var(--color-ink)">{x.last_preview}</div>{/if}
					</div>
					<StatusChip tone={x.chip.tone}>{x.chip.label}</StatusChip>
				</a>
			{/each}
		</div>
	{:else}
		<div class="card static" style="padding:18px;color:var(--color-mute);font-size:12.5px">판매자에게 남긴 문의가 여기에 모여요 — 주문 행의 [문의] 로 접수하면 브랜드가 바로 답합니다.</div>
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
