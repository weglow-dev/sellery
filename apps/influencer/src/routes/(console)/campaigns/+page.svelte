<script lang="ts">
	/**
	 * 내 캠페인 — 프로토타입 vSellerCamps · campRow 1:1 (js/20-seller.js): 행 = 상품 아이콘 · 상품명 · 브랜드 · 수수료 · 기간 · 상태 칩(LIVE 는 점멸).
	 * 진행 중 / 끝난 캠페인 두 묶음, 인플루언서 차례면 "다음 할 일" 한 줄. 행을 누르면 스레드(`/campaigns/<code>`). 캘린더는 다음 단계.
	 */
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const pct = (r: number) => (r * 100).toFixed(0);
</script>

<svelte:head>
	<title>캠페인 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>내 캠페인</h2>
	<span class="meta">클릭하면 캠페인 스레드로 이동</span>
</div>

{#snippet row(c: PageData['active'][number])}
	<a href={c.href} class="rowitem">
		<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={38} />
		<div class="grow">
			<div class="nm">{c.product.name} <span class="sub">· {c.brand.name}</span></div>
			<div class="sub">
				수수료 {pct(c.product.commission_rate)}%{#if c.test_due && c.status === 'TESTING'}{' '}· 테스트 기한 {md(c.test_due)}{/if}
			</div>
			{#if c.hint}<div class="hintline">→ {c.hint}</div>{/if}
		</div>
		{#if c.start_date}<span class="dates">{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'}</span>{/if}
		<StatusChip tone={c.chip.live ? 'live' : c.chip.tone}>{c.chip.label}</StatusChip>
	</a>
{/snippet}

<div class="sec">진행 중 {#if data.active.length}<span class="badge">{data.active.length}</span>{/if}</div>
<div class="listcard console-rows">
	{#each data.active as c (c.code)}
		{@render row(c)}
	{:else}
		<div class="empty">
			캠페인이 없습니다
			<div style="margin-top:12px"><a href={data.productsPath} class="btn pri sm">상품 갤러리에서 시작하기 →</a></div>
		</div>
	{/each}
</div>

{#if data.ended.length}
	<div class="sec" style="margin-top:22px">끝난 캠페인 <span class="console-sec-sub">— 같은 상품을 다시 요청할 수 있어요</span></div>
	<div class="listcard console-rows">
		{#each data.ended as c (c.code)}
			{@render row(c)}
		{/each}
	</div>
{/if}
