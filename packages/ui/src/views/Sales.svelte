<script lang="ts">
	/* 실시간 매출 (js/30-shared.js vSales) */
	import { S, D_, prod, seller, calc, campOrders, myProductIds, fmt, md, P, ymd, today, addD, WHT, act, go } from '@sellery/core';
	import Sec from '../components/Sec.svelte';
	const cs = $derived(S.role === 'seller' ? D_().campaigns.filter((c) => c.sellerId === S.actingSeller && c.status === 'LIVE') : (() => { const my = myProductIds(S.actingBrand); return D_().campaigns.filter((c) => my.includes(c.productId) && c.status === 'LIVE'); })());
	const t = ymd(today());
</script>

<h2 class="pg">실시간 매출 <small>LIVE 판매의 판매 현황 — 주문이 들어오면 즉시 반영</small></h2>
<div style="margin-bottom:16px"><button class={S.ui.liveSim ? 'danger' : 'pri'} onclick={() => act.toggleLive()}>{S.ui.liveSim ? '⏸ 실시간 판매 시뮬레이션 중지' : '▶ 실시간 판매 시뮬레이션 시작'}</button><span style="font-size:12px;color:var(--mute);margin-left:10px">실서비스에선 결제 웹훅으로 자동 반영됩니다</span></div>
{#if !cs.length}
	<div class="listcard"><div class="empty">지금 LIVE 상태인 판매가 없습니다 — 캠페인을 시작해보세요</div></div>
{/if}
{#each cs as c}
	{@const p = prod(c.productId)}{@const s = seller(c.sellerId)}{@const k = calc(c)}{@const os = campOrders(c.id)}
	{@const todayOs = os.filter((o) => o.at === t && o.status === 'PAID')}
	{@const todayRev = todayOs.reduce((a, o) => a + o.unit * o.qty, 0)}
	{@const visits = Math.round((k.paidCnt + k.refCnt) * 17.3)}
	{@const conv = visits ? ((k.paidCnt + k.refCnt) / visits * 100).toFixed(1) : '0.0'}
	{@const days = [...Array(7)].map((_, i) => { const d = ymd(addD(today(), i - 6)); return { d, rev: os.filter((o) => o.at === d && o.status !== 'CANCELED').reduce((a, o) => a + o.unit * o.qty, 0) }; })}
	{@const mx = Math.max(...days.map((x) => x.rev), 1)}
	{@const feed = os.slice(-10).reverse()}
	<Sec>{p.name} · {s.handle} <span class="st live" style="margin-left:4px"><span class="pulse"></span>진행중</span></Sec>
	<div class="grid g4">
		<div class="card kpi"><div class="lbl">오늘 매출</div><div class="val">₩{fmt(todayRev)}</div><div class="sub">주문 {todayOs.length}건</div></div>
		<div class="card kpi"><div class="lbl">누적 확정 매출</div><div class="val">₩{fmt(k.net)}</div><div class="sub">결제 {k.paidCnt}건 · 환불 {k.refCnt}건</div></div>
		<div class="card kpi"><div class="lbl">{S.role === 'seller' ? '내 수수료 (실시간)' : '브랜드 정산액 (실시간)'}</div><div class="val" style="color:var(--money)">₩{fmt(S.role === 'seller' ? k.sfTotal * (1 - WHT) : k.brandPay)}</div><div class="sub">{S.role === 'seller' ? '원천징수 후 예상' : '수수료 차감 후 예상'}</div></div>
		<div class="card kpi"><div class="lbl">방문 → 구매 전환</div><div class="val">{conv}%</div><div class="sub">방문 {fmt(visits)}회 (추정)</div></div>
	</div>
	<div class="livegrid" style="margin-top:16px">
		<div class="card"><h4 style="margin:0 0 4px;font-size:13px">최근 7일 매출</h4>
			<div class="barwrap"><div class="bars">{#each days as x}<div class="b" style="height:{Math.max(3, x.rev / mx * 100)}%"><span class="bl">{x.rev ? '₩' + fmt(Math.round(x.rev / 1000)) + 'k' : ''}</span><span class="bd">{md(P(x.d))}</span></div>{/each}</div></div>
		</div>
		<div class="card" style="padding:0"><h4 style="margin:0;padding:14px 16px 8px;font-size:13px">주문 피드</h4>
			<div class="feed">{#each feed as o}<div class="rowitem"><div class="grow"><span style="font-weight:600">{o.buyer}</span> <span class="sub">{o.qty}개 · {md(P(o.at))}</span></div><span class="num">₩{fmt(o.unit * o.qty)}</span>{#if o.status === 'REFUNDED'}<span class="st red">환불</span>{/if}</div>{:else}<div class="empty">아직 주문 없음</div>{/each}</div>
		</div>
	</div>
	<div style="margin-top:12px"><button class="sm ghost" onclick={() => go.camp(c.id)}>캠페인 상세 →</button></div>
{/each}
