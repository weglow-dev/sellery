<script lang="ts">
	/**
	 * 상품 갤러리 — 프로토타입 js/20-seller.js vExplore · prodCard 1:1 (베스트셀링 TOP5 · 트렌드 픽은 데모 지표라 제외 — docs/inf-console-plan.md §6 `/products`).
	 * 카테고리 칩(전체 + 상품이 있는 카테고리 · `?cat=`) · 카테고리 안내(CAT_POLICY · CAT_INFO) · 카드(누끼/이모지 · 브랜드 · 판매가 · 수수료 · 🎁 샘플 한 줄 · 버튼).
	 * 버튼은 서버가 만든 `sampleButton` — 무상 요청·구매·진행 중은 전부 상세(`/products/<code>`)로 간다(배송지 입력은 상세에서). 샘플 구매는 4단계 예고로 비활성.
	 */
	import { CAT_INFO, CAT_POLICY, GRADES } from '@sellery/core/constants';
	import { discountPct, fmtNum, imageSrc } from '@sellery/db/campaign';
	import { GradeBox, Tilt } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const chips = $derived(['전체', ...data.categories]);
	const info = $derived(data.cat !== '전체' ? (CAT_INFO as Record<string, { en: string; desc: string; ex: string }>)[data.cat] : null);
	const topBonus = GRADES[0]?.bonus ?? 3;
	const pct = (r: number) => (r * 100).toFixed(0);
</script>

<svelte:head>
	<title>상품 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>상품 갤러리</h2>
	{#if data.quota}
		<span class="meta" style="margin-left:auto">
			이번 달 샘플 요청 <b>{data.quota.left}회 남음</b>{#if data.quota.left === 0}{' '}— <span style="color:var(--color-danger)">한도 소진 시 샘플 구매로 진행</span>{/if}
		</span>
	{/if}
</div>
<p class="meta" style="margin:-8px 3px 14px">브랜드가 판매가·수수료율을 공개 책정 · 무상 샘플 조건에 맞으면 [무상 샘플 요청], 아니면 샘플 구매로 진행해요.</p>

<div class="cats" role="tablist" aria-label="카테고리">
	{#each chips as c (c)}
		<a href={c === '전체' ? data.listPath : `${data.listPath}?cat=${encodeURIComponent(c)}`} class="catchip {c === data.cat ? 'on' : ''}" role="tab" aria-selected={c === data.cat} title={CAT_INFO[c] ? `${CAT_INFO[c].desc} · ${CAT_INFO[c].ex}` : '건강·웰니스 전 카테고리'} data-sveltekit-noscroll>{c}</a>
	{/each}
</div>
<div class="catguide">
	{#if info}
		<b>{data.cat}</b> <span class="en">{info.en}</span> — {info.desc} · 예: {info.ex}
	{:else}
		<b>건강·웰니스 전용 갤러리</b> — {CAT_POLICY}
	{/if}
</div>

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
			<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
				<span class="chip brand">{p.brand.name}</span>
				<GradeBox grade={p.brand.grade} sm />
				<span class="sub" style="font-size:11px;color:var(--color-mute)">{p.category}</span>
			</div>
			<a href={p.href} class="nm">{p.name}</a>
			<div class="meta">{p.description ?? ''}{p.description && p.sample_text ? ' · ' : ''}{p.sample_text ? `샘플 ${p.sample_text}` : ''}</div>
			{#if p.line}<div class="meta" style="font-size:11px">🎁 {p.line}</div>{/if}
			<div class="prices">
				<span class="gp">₩{fmtNum(p.sale_price)}</span>
				<span class="cp">₩{fmtNum(p.consumer_price)}</span>
				{#if disc !== null}<span class="disc">-{disc}%</span>{/if}
				<span class="rate">수수료 {pct(p.commission_rate)}~{(p.commission_rate * 100 + topBonus).toFixed(0)}%</span>
			</div>
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
