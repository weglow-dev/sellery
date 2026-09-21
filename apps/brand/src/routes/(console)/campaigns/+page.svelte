<script lang="ts">
	/**
	 * 내 캠페인 — 프로토타입 데모 camps/+page.svelte 1:1 (칩 필터 · 진행 중 / 진행 예정 / 준비 중(샘플·테스트·일정) / 종료·정산 묶음).
	 * 행 = 상품 아이콘 · 상품명 · 인플루언서(플랫폼 · 이름 · 핸들) · 기간·배정 재고 또는 상태·테스트 기한·수수료 · 다음 할 일(브랜드 차례만) · 오픈 D-n · 상태 칩(LIVE 점멸). 행을 누르면 스레드.
	 * LIVE 카드의 매출·주문·발주서는 4단계(주문) — 지금은 판매 링크와 "주문은 4단계" 안내만.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const today = kstToday();
	const pct = (r: number) => (r * 100).toFixed(0);
	const show = (k: 'live' | 'soon' | 'prep' | 'done') => data.filter === 'all' || data.filter === k;
	type Row = PageData['live'][number];
</script>

<svelte:head>
	<title>캠페인 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>내 캠페인</h2>
	<span class="meta">브랜드가 진행 중인 판매 · 클릭하면 캠페인 스레드로 이동</span>
	<a href={data.requestsPath} class="btn ghost sm" style="margin-left:auto">처리 대기 →</a>
</div>

<nav class="cats console-filters" aria-label="캠페인 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {data.filter === f.key ? 'on' : ''}" aria-current={data.filter === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
</nav>

{#snippet row(c: Row)}
	<a href={c.href} class="rowitem">
		<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={38} />
		<div class="grow">
			<div class="nm">{c.product.name} <span class="sub">· <PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} /></span></div>
			<div class="sub">
				{#if c.start_date}
					{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'} · 배정 재고 {fmtNum(c.qty)}{#if c.status === 'LIVE' || c.status === 'CLEARING'}{' '}· 판매 {fmtNum(c.sold_qty)}개{/if}
				{:else}
					{c.chip.label}{c.test_due ? ` · 테스트 기한 ${md(c.test_due)}` : ''} · 수수료 {pct(c.product.commission_rate)}%
				{/if}
			</div>
			{#if c.chip.turn === 'brand'}<div class="hintline">→ {c.action.label}</div>{/if}
		</div>
		{#if c.status === 'SCHEDULE_CONFIRMED' && c.start_date}
			<span class="st blue" style="animation:none">오픈 D-{Math.max(0, daysBetween(today, c.start_date))}</span>
		{:else if c.status === 'LIVE' && c.end_date}
			<span class="dates">마감 D-{Math.max(0, daysBetween(today, c.end_date))}</span>
		{/if}
		<StatusChip tone={c.chip.live ? 'live' : c.chip.tone}>{c.chip.label}</StatusChip>
	</a>
{/snippet}

{#snippet sec(title: string, list: Row[], empty: string, extraTop = false)}
	<div class="sec" style={extraTop ? 'margin-top:22px' : ''}>{title} {#if list.length}<span class="badge">{list.length}</span>{/if}</div>
	<div class="listcard console-rows">
		{#each list as c (c.code)}{@render row(c)}{:else}<div class="empty">{empty}</div>{/each}
	</div>
{/snippet}

{#if show('live')}
	{@render sec('진행 중', data.live, '진행 중인 판매가 없습니다')}
	{#if data.live.length}
		<p class="meta" style="margin:8px 3px 0">주문 · 발주서 · 실시간 매출은 <b>4단계</b>(주문 탭)에서 열립니다 — 지금은 스레드에서 판매 링크를 확인할 수 있어요.</p>
	{/if}
{/if}
{#if show('soon')}{@render sec('진행 예정', data.soon, '예정된 판매가 없습니다 — 일정 승인을 기다리는 요청은 처리 대기에서 확인하세요', true)}{/if}
{#if show('prep')}{@render sec('준비 중 (샘플·테스트·일정)', data.prep, '준비 중인 캠페인이 없습니다', true)}{/if}
{#if show('done')}{@render sec('종료 · 정산', data.done, '종료된 캠페인이 없습니다', true)}{/if}

{#if data.filter === 'all' && !data.live.length && !data.soon.length && !data.prep.length && !data.done.length}
	<p class="meta" style="margin:10px 3px 0">아직 캠페인이 없어요 — <a href={data.productsPath}>상품을 등록</a>하고 검수를 통과하면 인플루언서가 샘플을 요청합니다.</p>
{/if}
