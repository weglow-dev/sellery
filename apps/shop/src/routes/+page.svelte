<script lang="ts">
	/* 고객 홈 (js/60-customer.js vCustHome) */
	import { S, D_, camp, prod, seller, soldQty, custVisible, isHomeFeat, viewersOf, platformGmv, cartN, gname, platIcon, fmt, fmtKR, ymd, today, P, CATS, CAT_INFO, CLEAR_DAYS, CEL, KAKAO_ICON, act, go } from '@sellery/core';
	import { Sec, PIcon, GradeBox, CustCard } from '@sellery/ui';
	const sel = $derived(S.ui.custSel ? seller(S.ui.custSel) : null);
	const cat = $derived(S.ui.custCat || '전체');
	const inCat = (c: { productId: string }) => cat === '전체' || prod(c.productId).cat === cat;
	const live = $derived(D_().campaigns.filter((c) => c.status === 'LIVE' && custVisible(c) && (!sel || c.sellerId === sel.id) && inCat(c)).sort((a, b) => (+isHomeFeat(b) - +isHomeFeat(a)) || (soldQty(b.id) - soldQty(a.id))));
	const soon = $derived(D_().campaigns.filter((c) => c.status === 'SCHEDULE_CONFIRMED' && custVisible(c) && (!sel || c.sellerId === sel.id) && inCat(c)).sort((a, b) => (+isHomeFeat(b) - +isHomeFeat(a)) || (P(a.start!).getTime() - P(b.start!).getTime())));
	const allLive = $derived(D_().campaigns.filter((c) => c.status === 'LIVE' && custVisible(c)));
	const todayStr = ymd(today());
	const todayOrders = $derived(D_().orders.filter((o) => o.at === todayStr && o.status === 'PAID' && !o.sample));
	const viewers = $derived(allLive.reduce((a, c) => a + viewersOf(c.id), 0) + 41);
	const pubSellers = $derived(D_().sellers.filter((x) => !x.hidden));
	const catCount = (k: string) => D_().campaigns.filter((c) => ['LIVE', 'SCHEDULE_CONFIRMED'].includes(c.status) && custVisible(c) && (k === '전체' || prod(c.productId).cat === k)).length;
	const rank = $derived(D_().campaigns.filter((c) => ['LIVE', 'SCHEDULE_CONFIRMED', 'CLEARING'].includes(c.status) && custVisible(c)).map((c) => ({ c, q: soldQty(c.id) })).sort((a, b) => b.q - a.q).slice(0, 5));
	const mxq = $derived(rank.length ? Math.max(1, rank[0].q) : 1);
	const lc = $derived(S.linkCtx ? camp(S.linkCtx.cid) : null);
</script>

<div class="hero-band">
	<div class="ey">{@html CEL} SELLERY — 검증된 사람이 고른 웰니스</div>
	<h1>{#if sel}{sel.name}님이 추천하는 <em>진행 중인 상품</em>{:else}셀러리에 오신 고객님, <em>환영합니다.</em>{/if}</h1>
	{#if !sel}<div class="tagline">지금 진행 중인 <b>최저가 상품</b>을 소개합니다.</div>{/if}
	<div class="sub">{#if !sel}인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 <b>{CLEAR_DAYS}일</b>까지 <b>셀러리</b>가 보관합니다. <button class="sm ghost" style="margin-left:10px" onclick={() => go.screen('about')}>셀러리가 뭔가요? →</button>{:else}<button class="sm ghost" style="margin-left:10px" onclick={() => (S.ui.custSel = null)}>전체 보기</button>{/if}</div>
	<div class="cstats">
		<div><span class="cs-l">👀 지금 보는 중</span><span class="cs-v"><span class="pulse" style="color:var(--red)"></span>{fmt(viewers)}명</span></div>
		<div><span class="cs-l">오늘 판매</span><span class="cs-v">{fmt(todayOrders.reduce((a, o) => a + o.qty, 0))}개</span></div>
		<div><span class="cs-l">누적 판매액</span><span class="cs-v">₩{fmtKR(platformGmv())}</span></div>
		<div><span class="cs-l">인증 인플루언서 · 브랜드</span><span class="cs-v">{pubSellers.length}명 · {D_().brands.length}개</span></div>
	</div>
</div>
{#if lc}<div class="notice" style="margin-bottom:14px">🔗 <b>{seller(lc.sellerId).name}</b>님의 판매 링크로 들어오셨어요 — 이 판매와 같은 상품·카테고리의 다른 판매는 표시되지 않습니다. (판매 종료까지 유지)</div>{/if}
<div class="cats" style="margin:0 0 6px">{#each CATS as k}<button class="catchip {cat === k ? 'on' : ''}" onclick={() => (S.ui.custCat = k)}>{k} <span style="color:var(--mute);font-weight:400">{catCount(k)}</span></button>{/each}</div>
<div class="catguide">{#if cat === '전체'}<b>건강·웰니스만 다룹니다</b> — 건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 그 밖의 품목은 취급하지 않습니다.{:else}<b>{cat}</b> <span class="en">{CAT_INFO[cat].en}</span> — {CAT_INFO[cat].desc} · 예: {CAT_INFO[cat].ex}{/if}</div>
<div class="custgrid">
	<div>
		<Sec badge={live.length} style="margin-top:8px">진행 중</Sec>
		<div class="grid g2">{#each live as c}<CustCard {c} />{:else}<div class="empty" style="grid-column:1/-1">이 카테고리에 진행 중인 판매가 없습니다</div>{/each}</div>
		<Sec badge={soon.length} style="margin-top:22px">오픈 예정</Sec>
		<div class="grid g2">{#each soon as c}<CustCard {c} />{:else}<div class="empty" style="grid-column:1/-1">예정된 판매가 없습니다</div>{/each}</div>
	</div>
	<div>
		<Sec style="margin-top:8px">실시간 판매 순위</Sec>
		<div class="card">
			<div style="font-size:11px;color:var(--mute);margin-bottom:10px">판매 수량 기준 · 실시간 집계</div>
			{#each rank as { c, q }, i}{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}<div class="hb-row" role="button" tabindex="0" onclick={() => go.store(c.id)} onkeydown={(e) => e.key === 'Enter' && go.store(c.id)}><span class="hb-nm">{i + 1}. <PIcon {p} sz={20} /> {p.name} <span style="color:var(--mute);font-weight:400">· {sl.name}</span></span><div class="hb-track"><div class="hb-bar {i === 0 ? 'top' : ''}" style="width:{Math.max(6, q / mxq * 100)}%"></div></div><span class="hb-val">{fmt(q)}개</span></div>{:else}<div class="empty">순위 집계 중</div>{/each}
		</div>
		<Sec style="margin-top:22px">인플루언서</Sec>
		<div class="card"><div class="flex gap-2 flex-wrap">{#each pubSellers as x}<button class="catchip" onclick={() => (S.ui.custSel = x.id)}>{@html platIcon(x)} {x.name} <GradeBox g={gname(x)} /></button>{/each}</div>
			<div style="margin-top:10px"><button class="sm ghost" onclick={() => go.screen('influencers')}>인플루언서 전체 보기 →</button></div></div>
	</div>
</div>
<Sec style="margin-top:26px">셀러리가 다른 이유</Sec>
<div class="why">
	<div class="card"><div class="why-i">{@html CEL}</div><b>건강·웰니스만</b><div class="meta">건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 한 분야를 깊게 검증합니다.</div></div>
	<div class="card"><div class="why-i">✅</div><b>검증된 상품</b><div class="meta">브랜드 사업자 확인과 상품 검수(표시광고 기준)를 거친 상품만 노출됩니다. 판매가는 브랜드가 셀러리에 등록한 가격 그대로입니다.</div></div>
	<div class="card"><div class="why-i">🛡️</div><b>인증 인플루언서</b><div class="meta">채널 소유 인증과 실제 판매 실적에 따른 7단계 등급. 모든 판매 페이지에 인증 마크가 표시됩니다.</div></div>
	<div class="card"><div class="why-i">🔒</div><b>안전 결제 · {CLEAR_DAYS}일 환불 보호</b><div class="meta">결제 대금은 셀러리가 보관하고, 판매 종료 후 {CLEAR_DAYS}일의 환불 보호 기간이 지난 뒤 정산됩니다.</div></div>
	<div class="card"><div class="why-i">🚚</div><b>브랜드 직배송</b><div class="meta">중간 유통 없이 브랜드가 직접 발송합니다. 운송장은 알림톡으로, 문의는 셀러리 고객센터로 받습니다.</div></div>
	<div class="card"><div class="why-i">⏱️</div><b>기간 한정 가격</b><div class="meta">인플루언서 판매 기간에만 열리는 가격입니다. 같은 기간, 다른 곳에서 더 낮은 가격은 없습니다.</div></div>
</div>
<div class="card flex justify-between items-center gap-3 flex-wrap" style="margin-top:18px;padding:16px 20px">
	{#if S.cust}<div><b>{S.cust.name}님</b> <span class="meta">주문·배송·환불은 <b>내 주문</b>에서 한곳에 관리돼요{cartN() ? ` · 장바구니에 ${cartN()}개` : ''}</span></div><div class="btnrow" style="margin:0"><button class="pri sm" onclick={() => go.screen('orders')}>내 주문 보기</button>{#if cartN()}<button class="sm ghost" onclick={() => go.screen('cart')}>장바구니 {cartN()}</button>{/if}</div>
	{:else}<div><b>셀러리 회원이 되면</b> <span class="meta">오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력</span></div><div class="btnrow" style="margin:0"><button class="sm kakao" onclick={() => act.kakaoStart('')}>{@html KAKAO_ICON} 카카오로 시작하기</button><button class="sm ghost" onclick={() => go.screen('about')}>셀러리 소개</button></div>{/if}
</div>
