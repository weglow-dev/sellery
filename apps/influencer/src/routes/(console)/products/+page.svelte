<script lang="ts">
	/**
	 * 상품 갤러리 — 프로토타입 js/20-seller.js vExplore · prodCard 1:1 (베스트셀링 TOP5 · 트렌드 픽은 데모 지표라 제외 — docs/inf-console-plan.md §6 `/products`).
	 * 카테고리 칩(전체 + 상품이 있는 카테고리 · `?cat=`) · 카테고리 안내(CAT_POLICY · CAT_INFO) · 카드(누끼/이모지 · 브랜드 · 판매가 · 수수료 · 🎁 샘플 한 줄 · 버튼).
	 * 버튼은 서버가 만든 `sampleButton` — 무상 요청·구매·진행 중은 전부 상세(`/products/<code>`)로 간다(배송지 입력은 상세에서). 샘플 구매는 4단계 예고로 비활성.
	 */
	import { CAT_INFO, GRADES } from '@sellery/core/constants';
	import { discountPct, fmtNum, imageSrc } from '@sellery/db/campaign';
	import { Tilt } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const chips = $derived(['전체', ...data.categories]);
	const freeHref = $derived((() => { const u = new URLSearchParams(); if (data.cat !== '전체') u.set('cat', data.cat); if (!data.free) u.set('free', '1'); const q = u.toString(); return q ? `${data.listPath}?${q}` : data.listPath; })());
	const info = $derived(data.cat !== '전체' ? (CAT_INFO as Record<string, { en: string; desc: string; ex: string }>)[data.cat] : null);
	const topBonus = GRADES[0]?.bonus ?? 3;
	const pct = (r: number) => (r * 100).toFixed(0);
</script>

<svelte:head>
	<title>상품 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>상품 갤러리</h2>
</div>

<!-- 무상 필터 — 카테고리와 별개의 체크 토글 (대표 결정 2026-10-08): 켜면 내 등급으로 지금 무상 요청이 되는(아직 안 받은) 상품만. 월 한도 없음(0047) -->
<a href={freeHref} class="filtertoggle {data.free ? 'on' : ''}" role="checkbox" aria-checked={data.free} data-sveltekit-noscroll>
	<span class="box" aria-hidden="true">{data.free ? '✓' : ''}</span>
	<span>내 등급으로 무상 샘플 가능한 상품만 보기</span>
</a>

<div class="cats" role="tablist" aria-label="카테고리">
	{#each chips as c (c)}
		<a href={c === '전체' ? (data.free ? `${data.listPath}?free=1` : data.listPath) : `${data.listPath}?cat=${encodeURIComponent(c)}${data.free ? '&free=1' : ''}`} class="catchip {c === data.cat ? 'on' : ''}" role="tab" aria-selected={c === data.cat} title={CAT_INFO[c] ? `${CAT_INFO[c].desc} · ${CAT_INFO[c].ex}` : '건강·웰니스 전 카테고리'} data-sveltekit-noscroll>{c}</a>
	{/each}
</div>
{#if info}
	<div class="catguide"><b>{data.cat}</b> <span class="en">{info.en}</span> — {info.desc} · 예: {info.ex}</div>
{/if}

<div class="console-prods">
	{#each data.cards as p (p.code ?? p.name)}
		{@const thumb = imageSrc(p.thumb_url)}
		{@const disc = discountPct(p.consumer_price, p.sale_price)}
		{@const b = p.button}
		<div class="card prod">
			<a href={p.href} class="ph" aria-label="{p.name} 상세" style="position:relative">
				<Tilt>
					{#if thumb}<img src={thumb} alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none" />{:else}{p.emoji}{/if}
				</Tilt>
				{#if p.boosted}<span class="trendbadge feat">★ 부스트</span>{/if}
				{#if p.exclusive_label}<span class="exclbadge">독점권 오퍼</span>{/if}
			</a>
			<div class="brandline">
				{#if p.brand.logo_url}<img src={imageSrc(p.brand.logo_url)} alt="" class="brandlogo" />{/if}
				<span class="brandname">{p.brand.name}</span>
				<span class="sub" style="font-size:11px;color:var(--color-mute)">· {p.category}</span>
			</div>
			<a href={p.href} class="nm">{p.name}</a>
			{#if p.description}<div class="meta">{p.description}</div>{/if}
			<div class="pricegrid">
				<div><span class="pl">셀러 판매가</span><span class="gp">₩{fmtNum(p.sale_price)}</span>{#if disc !== null}<span class="disc">-{disc}%</span>{/if}</div>
				<div><span class="pl">브랜드 시중가</span><span class="cp">₩{fmtNum(p.consumer_price)}</span></div>
				<div><span class="pl">수수료</span><span class="rate">{pct(p.commission_rate)}~{(p.commission_rate * 100 + topBonus).toFixed(0)}%</span></div>
			</div>
			{#if p.status.rule}
				<div class="samplebox"><div class="rule">🎁 {p.status.rule}</div></div>
			{/if}
			<div class="meta">
				건당 예상 수수료 ₩{fmtNum(Math.round(p.sale_price * p.commission_rate))}{#if b.kind === 'locked'}{' '}· <b style="color:var(--color-danger)">독점 인플루언서 확정 상품</b>{/if}
			</div>
			<div class="btnrow">
				<a href={p.href} class="btn sm ghost">실적·상세</a>
				{#if b.kind === 'locked' || b.kind === 'unlisted'}
					<button type="button" class="sm" disabled aria-disabled="true" title={b.title ?? undefined} style="opacity:.5">{b.label}</button>
				{:else if b.kind === 'buy'}
					<a href="{p.href}#sample" class="btn pri sm" title={b.title ?? undefined} style={b.disabled ? 'opacity:.6' : ''}>{b.label}</a>
				{:else if b.kind === 'active'}
					<a href="{p.href}#sample" class="btn sm">{b.label} →</a>
				{:else}
					<a href="{p.href}#sample" class="btn pri sm">{b.label}</a>
				{/if}
			</div>
		</div>
	{:else}
		<div class="empty card static" style="grid-column:1/-1">해당 카테고리에 노출 중인 상품이 없습니다</div>
	{/each}
</div>
