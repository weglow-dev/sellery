<script lang="ts">
	import { S, D_, prod, seller, calc, campOrders, soldQty, myProductIds, platIcon, fmt, md, P, ymd, today, daysLeft, daysUntil, ST, act, go, type Campaign } from '@sellery/core';
	import { Sec, PIcon, StChip, Calendar, Chips } from '@sellery/ui';
	const myP = $derived(myProductIds(S.actingBrand));
	const cs = $derived(D_().campaigns.filter((c) => myP.includes(c.productId)));
	const f = $derived(S.ui.bcF || 'all');
	const G = $derived({
		live: cs.filter((c) => c.status === 'LIVE'), soon: cs.filter((c) => c.status === 'SCHEDULE_CONFIRMED'),
		prep: cs.filter((c) => ['INVITED', 'SAMPLE_REQUESTED', 'SAMPLE_APPROVED', 'SAMPLE_PURCHASED', 'SAMPLE_SHIPPED', 'TESTING', 'SCHEDULE_PROPOSED'].includes(c.status)),
		done: cs.filter((c) => ['CLEARING', 'SETTLED', 'REJECTED', 'PASSED', 'DECLINED'].includes(c.status))
	});
	const todayStr = ymd(today());
	const chips = $derived<[string, string, number][]>([['all', '전체', cs.length], ['live', '진행 중', G.live.length], ['soon', '진행 예정', G.soon.length], ['prep', '준비 중', G.prep.length], ['done', '종료·정산', G.done.length]]);
</script>

{#snippet row(c: Campaign)}
	{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}
	<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} />
		<div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {@html platIcon(sl)} {sl.name} {sl.handle}</span></div>
			<div class="sub">{#if c.start}{md(P(c.start))}–{md(P(c.end!))} · 배정 재고 {fmt(c.qty || 0)}{:else}{ST[c.status].l}{c.testDue ? ` · 테스트 기한 ${md(P(c.testDue))}` : ''} · 수수료 {(p.rate * 100).toFixed(0)}%{/if}</div></div>
		{#if c.status === 'SCHEDULE_CONFIRMED' && c.start}<span class="st blue" style="animation:none">오픈 D-{Math.max(0, daysUntil(c.start))}</span>{/if}<StChip st={c.status} /></div>
{/snippet}
{#snippet sec(t: string, list: Campaign[], empty: string)}
	<Sec badge={list.length}>{t}</Sec>
	<div class="listcard">{#each list as c}{@render row(c)}{:else}<div class="empty">{empty}</div>{/each}</div>
{/snippet}

<h2 class="pg">내 캠페인 <small>브랜드가 진행 중인 판매 · 클릭하면 캠페인 스레드로 이동</small></h2>
<Chips list={chips} cur={f} onpick={(k) => (S.ui.bcF = k)} />
{#if f === 'all' || f === 'live'}
	<Sec badge={G.live.length}>진행 중</Sec>
	{#if G.live.length}
		<div class="grid {G.live.length > 1 ? 'g2' : ''}">
			{#each G.live as c}
				{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}{@const k = calc(c)}{@const os = campOrders(c.id).filter((o) => o.status === 'PAID')}{@const tod = os.filter((o) => o.at === todayStr)}{@const un = os.filter((o) => !o.tracking).length}{@const lft = (c.qty || 0) - soldQty(c.id)}
				<div class="card" style="padding:16px 18px">
					<div class="flex justify-between items-center gap-2.5 flex-wrap"><div class="flex items-center gap-2 min-w-0"><PIcon {p} sz={30} /><span class="min-w-0"><b style="font-size:15px">{p.name}</b> <span class="sub" style="color:var(--mute);font-size:12px">{@html platIcon(sl)} {sl.name} {sl.handle}</span></span></div><div class="flex gap-1.5 items-center">{#if un}<span class="st amber" style="animation:none">미발송 {un}건</span>{/if}<StChip st="LIVE" /></div></div>
					<div class="mini-stats" style="margin:12px 0 10px"><div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmt(tod.reduce((a, o) => a + o.unit * o.qty, 0))}</span></div><div><span class="ms-l">확정 매출</span><span class="ms-v">₩{fmt(k.net)}</span></div><div><span class="ms-l">주문</span><span class="ms-v">{k.paidCnt}건</span></div><div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-{daysLeft(c.end!)} · {fmt(Math.max(0, lft))}개</span></div></div>
					<div class="btnrow one"><button class="sm ghost" onclick={() => go.camp(c.id)}>스레드</button><button class="sm ghost" onclick={() => go.store(c.id)}>구매 페이지</button><button class="sm ghost" onclick={() => act.poCSV()}>발주서 CSV</button><button class="sm ghost" onclick={() => go.screen('sales')}>실시간 매출</button></div>
				</div>
			{/each}
		</div>
	{:else}<div class="listcard"><div class="empty">진행 중인 판매가 없습니다</div></div>{/if}
{/if}
{#if f === 'all' || f === 'soon'}{@render sec('진행 예정', G.soon, '예정된 판매가 없습니다 — 일정 승인을 기다리는 요청은 DM 요청함에서 확인하세요')}{/if}
{#if f === 'all' || f === 'prep'}{@render sec('준비 중 (샘플·테스트·일정)', G.prep, '준비 중인 캠페인이 없습니다')}{/if}
{#if f === 'all' || f === 'done'}{@render sec('종료 · 정산', G.done, '종료된 캠페인이 없습니다')}{/if}
<Calendar list={cs} brandView title="판매 캘린더 — 브랜드 스케줄 한눈에" />
