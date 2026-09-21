<script lang="ts">
	/**
	 * 고객 홈 `/` — web (customer)/page.tsx 마크업 동일 (프로토타입 vCustHome · ux-spec §3.2). 데이터는 +page.server.ts.
	 *   1 히어로 · 2 링크 보호 안내 · 3 카테고리 칩(URL ?cat=) · 4 카테고리 안내 · 5 목록 + 우측(순위 · 인플루언서 칩 ?seller=) · 6 셀러리가 다른 이유 · 7 하단 카드
	 */
	import { CATS, CAT_INFO, fmtKR, fmtNum, storeUrl } from '@sellery/db/campaign';
	import { CampaignCard, CEL, GradeBox, KAKAO_ICON, PlatIcon, ProductIcon, ViewersSum } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const DESCRIPTION = '인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 21일까지 셀러리가 보관합니다.';

	/** 카테고리·인플루언서 필터 = URL 상태 (web page.tsx qs) */
	function qs(next: { cat?: string; seller?: string | null }): string {
		const p = new URLSearchParams();
		const c = next.cat ?? data.cat;
		const s = next.seller === undefined ? data.sellerCode : next.seller;
		if (c && c !== '전체') p.set('cat', c);
		if (s) p.set('seller', s);
		const q = p.toString();
		return q ? `/?${q}` : '/';
	}

	const why = $derived([
		{ icon: '🥬', title: '건강·웰니스만', text: '건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 한 분야를 깊게 검증합니다.' },
		{ icon: '✅', title: '검증된 상품', text: '브랜드 사업자 확인과 상품 검수(표시광고 기준)를 거친 상품만 노출됩니다. 판매가는 브랜드가 셀러리에 등록한 가격 그대로입니다.' },
		{ icon: '🛡️', title: '인증 인플루언서', text: '채널 소유 인증과 실제 판매 실적에 따른 7단계 등급. 모든 판매 페이지에 인증 마크가 표시됩니다.' },
		{
			icon: '🔒',
			title: `안전 결제 · ${data.settings.clear_days}일 환불 보호`,
			text: `결제 대금은 셀러리가 보관하고, 판매 종료 후 ${data.settings.clear_days}일의 환불 보호 기간이 지난 뒤 정산됩니다.`
		},
		{ icon: '🚚', title: '브랜드 직배송', text: '중간 유통 없이 브랜드가 직접 발송합니다. 운송장은 알림톡으로, 문의는 셀러리 고객센터로 받습니다.' },
		{ icon: '⏱️', title: '기간 한정 가격', text: '인플루언서 판매 기간에만 열리는 가격입니다. 같은 기간, 다른 곳에서 더 낮은 가격은 없습니다.' }
	]);
</script>

<svelte:head>
	<title>셀러리</title>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:title" content="셀러리" />
	<meta property="og:description" content={DESCRIPTION} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="셀러리" />
	<meta name="twitter:description" content={DESCRIPTION} />
</svelte:head>

<!-- 1. 히어로 -->
<div class="hero-band">
	<div class="ey"><CEL /> SELLERY — 검증된 사람이 고른 웰니스</div>
	{#if data.sel}
		<h1>{data.sel.name}님이 추천하는 <em>진행 중인 상품</em></h1>
	{:else}
		<h1>셀러리에 오신 고객님, <em>환영합니다.</em></h1>
	{/if}
	{#if !data.sel}<div class="tagline">지금 진행 중인 <b>최저가 상품</b>을 소개합니다.</div>{/if}
	<div class="sub">
		{#if data.sel}
			<a href={qs({ seller: null })} class="btn sm ghost" style="margin-left:0">전체 보기</a>
		{:else}
			인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 <b>{data.settings.clear_days}일</b>까지 <b>셀러리</b>가 보관합니다.
		{/if}
	</div>
	<div class="cstats">
		<div>
			<span class="cs-l">👀 지금 보는 중</span>
			<span class="cs-v"><span class="pulse" style="color:var(--color-danger)" aria-hidden="true"></span><ViewersSum codes={data.allLiveCodes} />명</span>
		</div>
		<div>
			<span class="cs-l">오늘 판매</span>
			<span class="cs-v">{fmtNum(data.stats.today_qty)}개</span>
		</div>
		<div>
			<span class="cs-l">누적 판매액</span>
			<span class="cs-v">₩{fmtKR(data.stats.gmv)}</span>
		</div>
		<div>
			<span class="cs-l">인증 인플루언서 · 브랜드</span>
			<span class="cs-v">{fmtNum(data.stats.sellers)}명 · {fmtNum(data.stats.brands)}개</span>
		</div>
	</div>
</div>

<!-- 2. 링크 보호 안내 -->
{#if data.link}
	<div class="notice" style="margin-bottom:14px">
		🔗 <b>{data.link.sellerName}</b>님의 판매 링크로 들어오셨어요 — 이 판매와 같은 상품·카테고리의 다른 판매는 표시되지 않습니다. (판매 종료 후 {data.settings.link_protect_days}일까지 유지)
	</div>
{/if}

<!-- 3. 카테고리 칩 -->
<div class="cats" style="margin:0 0 6px" role="navigation" aria-label="카테고리">
	{#each CATS as k (k)}
		<a href={qs({ cat: k })} class={data.cat === k ? 'catchip on' : 'catchip'} aria-current={data.cat === k ? 'page' : undefined}>{k} <span class="n">{data.catCounts[k]}</span></a>
	{/each}
</div>
<!-- 4. 카테고리 안내 -->
<div class="catguide">
	{#if data.cat === '전체'}
		<b>건강·웰니스만 다룹니다</b> — 건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 그 밖의 품목은 취급하지 않습니다.
	{:else}
		<b>{data.cat}</b> <span class="en">{CAT_INFO[data.cat].en}</span> — {CAT_INFO[data.cat].desc} · 예: {CAT_INFO[data.cat].ex}
	{/if}
</div>

<!-- 5. 목록 + 우측 -->
<div class="custgrid">
	<div>
		<div class="sec" style="margin-top:8px">진행 중 <span class="badge">{data.live.length}</span></div>
		<div class="grid g2">
			{#each data.live as { c, allowFeat } (c.id)}
				<CampaignCard {c} today={data.today} featureDays={data.settings.home_feature_days} {allowFeat} />
			{:else}
				<div class="empty" style="grid-column:1 / -1">이 카테고리에 진행 중인 판매가 없습니다</div>
			{/each}
		</div>
		<div class="sec" style="margin-top:22px">오픈 예정 <span class="badge">{data.soon.length}</span></div>
		<div class="grid g2">
			{#each data.soon as { c, allowFeat } (c.id)}
				<CampaignCard {c} today={data.today} featureDays={data.settings.home_feature_days} {allowFeat} />
			{:else}
				<div class="empty" style="grid-column:1 / -1">예정된 판매가 없습니다</div>
			{/each}
		</div>
	</div>
	<div>
		<div class="sec" style="margin-top:8px">실시간 판매 순위</div>
		<div class="card">
			<div style="font-size:11px;color:var(--color-mute);margin-bottom:10px">판매 수량 기준 · 실시간 집계</div>
			{#each data.rank as c, i (c.id)}
				<a href={storeUrl(c.seller.handle, c.code)} class="hb-row">
					<span class="hb-nm">{i + 1}. <ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={20} /> {c.product.name} <span class="n">· {c.seller.name}</span></span>
					<div class="hb-track"><div class={i === 0 ? 'hb-bar top' : 'hb-bar'} style="width:{Math.max(6, (c.sold_qty / data.mxq) * 100)}%"></div></div>
					<span class="hb-val">{fmtNum(c.sold_qty)}개</span>
				</a>
			{:else}
				<div class="empty">순위 집계 중</div>
			{/each}
		</div>
		<div class="sec" style="margin-top:22px">인플루언서</div>
		<div class="card">
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				{#each data.pubSellers as s (s.id)}
					<a href={s.code ? qs({ seller: s.code }) : '/'} class={data.sel?.id === s.id ? 'catchip on' : 'catchip'} aria-current={data.sel?.id === s.id ? 'page' : undefined}>
						<PlatIcon platform={s.platform} /> {s.name} <GradeBox grade={s.grade} sm />
					</a>
				{/each}
				{#if !data.pubSellers.length}<span class="meta">인증 인플루언서를 준비 중입니다</span>{/if}
			</div>
		</div>
	</div>
</div>

<!-- 6. 셀러리가 다른 이유 -->
<div class="sec" style="margin-top:26px">셀러리가 다른 이유</div>
<div class="why">
	{#each why as w (w.title)}
		<div class="card">
			<div class="why-i" aria-hidden="true">{w.icon}</div>
			<b>{w.title}</b>
			<div class="meta">{w.text}</div>
		</div>
	{/each}
</div>

<!-- 7. 하단 카드 -->
<div class="card" style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px">
	{#if data.name}
		<div><b>{data.name}님</b> <span class="meta">주문·배송·환불은 <b>내 주문</b>에서 한곳에 관리돼요</span></div>
		<div class="btnrow" style="margin:0"><a href="/account/orders" class="btn pri sm">내 주문 보기</a></div>
	{:else}
		<div><b>셀러리 회원이 되면</b> <span class="meta">오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력</span></div>
		<div class="btnrow" style="margin:0"><a href="/login?next={encodeURIComponent('/')}" class="btn sm kakao"><KAKAO_ICON /> 카카오로 시작하기</a></div>
	{/if}
</div>
