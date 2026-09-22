<script lang="ts">
	/**
	 * /influencers — 인플루언서 목록 (프로토타입 vCustInfluencers 마크업 1:1 + 플랫폼·카테고리 칩 필터 · LIVE 판매 링크). 데이터는 +page.server.ts.
	 *   1 제목 · 2 링크 보호 안내 · 3 플랫폼 칩(?platform=) · 4 카테고리 칩(?cat=) · 5 카드 3열(아바타 · 이름 · 등급 · 플랫폼 핸들 · 팔로워 · 채널 인증 ✓ · 소개 · 카테고리 · 건수 · LIVE 링크)
	 * 카드의 "판매 보기" 는 홈 `?seller={code}` (프로토타입 custSel → 홈 이동과 동일).
	 */
	import { CATS, fmtNum, storeUrl } from '@sellery/db/campaign';
	import { SELLER_PLATFORMS } from '@sellery/db/sellers';
	import { GradeBox, PLATFORM_NAMES, PlatIcon, ProductIcon, SellerAvatar } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const TITLE = '인플루언서 — 셀러리';
	const DESCRIPTION = '셀러리 인증 인플루언서 — 채널 소유 인증과 판매 실적 등급을 확인하고, 진행 중·오픈 예정 판매를 살펴보세요.';

	/** 필터 = URL 상태 (홈 qs 와 같은 규칙) */
	function qs(next: { platform?: string | null; cat?: string | null }): string {
		const p = new URLSearchParams();
		const pl = next.platform === undefined ? data.platform : next.platform;
		const c = next.cat === undefined ? data.cat : next.cat;
		if (pl) p.set('platform', pl);
		if (c && c !== '전체') p.set('cat', c);
		const q = p.toString();
		return q ? `/influencers?${q}` : '/influencers';
	}
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<link rel="canonical" href={data.canonical} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={data.canonical} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESCRIPTION} />
</svelte:head>

<!-- 1. 제목 -->
<h2 class="pg">인플루언서 <small>셀러리 인증 인플루언서 — 진행 중·예정 판매를 확인하세요</small></h2>

<!-- 2. 링크 보호 안내 -->
{#if data.link}
	<div class="notice" style="margin-bottom:14px">
		🔗 <b>{data.link.sellerName}</b>님의 판매 링크로 들어오셨어요 — 이 판매와 같은 상품·카테고리의 다른 인플루언서 판매는 건수와 링크에 포함되지 않습니다.
	</div>
{/if}

<!-- 3. 플랫폼 칩 -->
<div class="cats" style="margin:0 0 6px" role="navigation" aria-label="플랫폼">
	<a href={qs({ platform: null })} class={data.platform ? 'catchip' : 'catchip on'} aria-current={data.platform ? undefined : 'page'}>전체 <span class="n">{data.total}</span></a>
	{#each SELLER_PLATFORMS as k (k)}
		<a href={qs({ platform: k })} class={data.platform === k ? 'catchip on' : 'catchip'} aria-current={data.platform === k ? 'page' : undefined}><PlatIcon platform={k} /> {PLATFORM_NAMES[k]} <span class="n">{data.counts.platform[k] ?? 0}</span></a>
	{/each}
</div>
<!-- 4. 카테고리 칩 -->
<div class="cats" style="margin:0 0 14px" role="navigation" aria-label="주력 카테고리">
	{#each CATS as k (k)}
		<a href={qs({ cat: k === '전체' ? null : k })} class={(data.cat ?? '전체') === k ? 'catchip on' : 'catchip'} aria-current={(data.cat ?? '전체') === k ? 'page' : undefined}>{k} <span class="n">{k === '전체' ? data.total : (data.counts.cat[k] ?? 0)}</span></a>
	{/each}
</div>

<!-- 5. 카드 -->
<div class="grid g3">
	{#each data.list as { s, stats } (s.id)}
		<div class="card infl">
			<div class="infl-head">
				<SellerAvatar avatarUrl={s.avatar_url} size={52} />
				<div class="infl-id">
					<div><b class="infl-nm">{s.name}</b> <GradeBox grade={s.grade} sm /></div>
					<div class="infl-sub"><PlatIcon platform={s.platform} /> {s.handle} · 팔로워 {fmtNum(s.followers)} · 채널 인증 ✓</div>
				</div>
			</div>
			{#if s.intro}<div class="meta" style="margin-top:8px">{s.intro}</div>{/if}
			<div class="infl-chips">
				{#if s.category}<a href={qs({ cat: s.category })} class="catchip sm">{s.category}</a>{/if}
				<span class={stats.live ? 'st green' : 'st gray'} style="animation:none">진행 중 {stats.live}</span>
				<span class="st blue" style="animation:none">오픈 예정 {stats.soon}</span>
				<span class="st gray" style="animation:none">완료 {stats.done}</span>
			</div>
			{#if stats.liveCards.length}
				<div class="infl-live">
					{#each stats.liveCards as c (c.id)}
						<a href={storeUrl(c.seller.handle, c.code)} class="infl-live-row"><span class="st live" style="animation:none"></span> <ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={18} /> <span class="nm">{c.product.name}</span> <span class="n">· {c.brand.name}</span></a>
					{/each}
				</div>
			{/if}
			{#if s.code}
				<div class="btnrow" style="margin-top:12px"><a href="/?seller={encodeURIComponent(s.code)}" class="btn sm ghost">판매 보기 →</a></div>
			{/if}
		</div>
	{:else}
		<div class="empty" style="grid-column:1 / -1">
			{#if data.platform || data.cat}조건에 맞는 인증 인플루언서가 없습니다 — <a href="/influencers">전체 보기</a>{:else}인증 인플루언서를 준비 중입니다{/if}
		</div>
	{/each}
</div>
