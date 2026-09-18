<script lang="ts">
	/* 상품 갤러리 (js/20-seller.js vExplore) */
	import { S, D_, seller, prod, calc, gradeOf, gfull, demoVisible, realFirst, passActive, sampleLeft, fmt, CATS, CAT_INFO, CAT_POLICY, CAT_TRENDS, DONE_STATES, openModal } from '@sellery/core';
	import { Sec, PIcon, ProdCard } from '@sellery/ui';
	const cur = $derived(S.ui.catFilter || '전체');
	const list = $derived(D_().products.filter((p) => p.status === 'listed' && demoVisible(p) && (cur === '전체' || p.cat === cur)).sort((a, b) => realFirst(a, b) || ((passActive(b, 'boost', 7) ? 1 : 0) - (passActive(a, 'boost', 7) ? 1 : 0))));
	const trendPicks = $derived(D_().products.filter((p) => p.status === 'listed' && demoVisible(p) && p.t).sort(realFirst));
	const meS = $derived(seller(S.actingSeller)), myTier = $derived(gradeOf(meS.m3Sales)), left = $derived(sampleLeft(meS));
	const top = $derived((() => {
		const peerIds = D_().sellers.filter((x) => x.m3Sales >= myTier.min).map((x) => x.id);
		const sums: Record<string, number> = { p1: 48200000, p4: 36400000, p7: 22100000, p9: 18900000, p5: 15200000, p8: 9800000 };
		D_().campaigns.filter((c) => peerIds.includes(c.sellerId) && DONE_STATES.includes(c.status)).forEach((c) => { sums[c.productId] = (sums[c.productId] || 0) + calc(c).net; });
		return Object.entries(sums).map(([pid, v]) => ({ p: prod(pid), v })).filter((x) => x.p && x.p.status === 'listed' && demoVisible(x.p)).sort((a, b) => realFirst(a.p, b.p) || (b.v - a.v)).slice(0, 5);
	})());
	const mx = $derived(top.length ? top[0].v : 1);
</script>

<h2 class="pg">상품 갤러리 <small>브랜드가 판매가·수수료율을 공개 책정 · 이번 달 샘플 요청 <b>{left}회 남음</b>{#if left === 0} — <span style="color:var(--danger)">한도 소진 시 샘플 구매로 진행</span>{/if}</small></h2>
<div class="grid g2" style="margin-bottom:18px">
	<div class="card">
		<div class="lbl-sm" style="margin-bottom:4px">{@html gfull(myTier.g)} 등급 이상 인플루언서 베스트셀링 TOP5</div>
		<div style="font-size:11px;color:var(--mute);margin-bottom:12px">최근 30일 확정 매출 · 데모 지표 포함</div>
		{#each top as x, i}
			<div class="hb-row" role="button" tabindex="0" onclick={() => openModal('productDetail', { pid: x.p.id })} onkeydown={(e) => e.key === 'Enter' && openModal('productDetail', { pid: x.p.id })}>
				<span class="hb-nm">{i + 1}. <PIcon p={x.p} sz={20} /> {x.p.name}</span>
				<div class="hb-track"><div class="hb-bar {i === 0 ? 'top' : ''}" style="width:{Math.max(6, x.v / mx * 100)}%"></div></div>
				<span class="hb-val">₩{fmt(x.v)}</span>
			</div>
		{/each}
	</div>
	<div class="card">
		<div class="lbl-sm" style="margin-bottom:8px">🔥 지금 뜨는 카테고리 — 최근 분기 매출 성장 (데모 지표)</div>
		<div class="cats flex-col items-start" style="margin-bottom:0">{#each CAT_TRENDS as t}<button class="catchip" onclick={() => (S.ui.catFilter = t.cat)}>{t.cat} <b style="color:var(--danger)">▲{t.g.replace('+', '')}</b> <span style="color:var(--mute);font-weight:400">{t.note}</span></button>{/each}</div>
	</div>
</div>
{#if cur === '전체' && trendPicks.length}
	<Sec>트렌드 픽 — 매출 급등 상품</Sec>
	<div class="grid g3" style="margin-bottom:26px">{#each trendPicks as p}<ProdCard {p} />{/each}</div>
	<Sec>전체 상품</Sec>
{/if}
<div class="cats">{#each CATS as c}<button class="catchip {c === cur ? 'on' : ''}" onclick={() => (S.ui.catFilter = c)} title={CAT_INFO[c] ? CAT_INFO[c].desc + ' · ' + CAT_INFO[c].ex : '건강·웰니스 전 카테고리'}>{c}</button>{/each}</div>
<div class="catguide">{#if cur === '전체'}<b>건강·웰니스 전용 갤러리</b> — {CAT_POLICY}{:else}<b>{cur}</b> <span class="en">{CAT_INFO[cur].en}</span> — {CAT_INFO[cur].desc} · 예: {CAT_INFO[cur].ex}{/if}</div>
<div class="grid g3">{#each list as p}<ProdCard {p} />{:else}<div class="empty card" style="grid-column:1/-1">해당 카테고리에 노출 중인 상품이 없습니다</div>{/each}</div>
