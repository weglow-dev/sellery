<script lang="ts">
	/* 관리자 대시보드 (js/50-admin.js vAdminHome) */
	import { S, D_, camp, prod, brand, seller, calc, settleDue, autoMatches, platIcon, fmt, md, P, ymd, today, ST, act, go, type Status } from '@sellery/core';
	import { HeroBand, Sec, PIcon, StChip, Chips } from '@sellery/ui';
	const cs = $derived(D_().campaigns), os = $derived(D_().orders);
	const done = $derived(cs.filter((c) => ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status)));
	const gmv = $derived(done.reduce((a, c) => a + calc(c).net, 0)), net = $derived(done.reduce((a, c) => a + calc(c).pfNet, 0));
	const refRate = $derived(os.length ? os.filter((o) => o.status === 'REFUNDED').length / os.length * 100 : 0);
	const todo = $derived<[number, string, string, string | null][]>([
		[D_().products.filter((p) => p.status === 'pending').length, '상품 검수 대기', 'products', 'pending'],
		[cs.filter((c) => c.status === 'CLEARING' && settleDue(c) <= today()).length, '정산 실행 가능', 'settle', null],
		[(D_().exclusiveReqs || []).filter((r) => r.status === 'PENDING').length, '독점권 신청 대기', 'home', null],
		[os.filter((o) => o.status === 'PAID' && !o.tracking).length, '미발송 주문', 'orders', 'PAID'],
		[D_().sellers.reduce((a, x) => a + (x.channels || []).filter((c) => !c.verified).length, 0), '미인증 채널', 'influencers', null],
		[D_().brands.filter((b) => !(b.settleInfo && b.settleInfo.account)).length + D_().sellers.filter((x) => !(x.settleInfo && x.settleInfo.account)).length, '정산정보 미등록 계정', 'brands', null],
		[autoMatches().length, '자동 제안 후보', 'match', null]
	]);
	const feed = $derived((() => { const f: { cid: string; at: string; txt: string }[] = []; Object.entries(D_().messages || {}).forEach(([cid, ms]) => ms.forEach((m) => { if (m.type === 'sys') f.push({ cid, at: m.at, txt: m.txt }); })); return f.sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : 0)).slice(0, 8); })());
	const f = $derived(S.ui.admCF || 'all');
	const flist = $derived(cs.filter((c) => f === 'all' || c.status === f).sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1)));
	const stCounts = $derived<[string, string, number][]>((Object.keys(ST) as Status[]).map((k) => [k, ST[k].l, cs.filter((c) => c.status === k).length] as [string, string, number]).filter((x) => x[2]));
	function admGo(scr: string, k: string | null) { if (scr === 'products' && k) S.ui.admPS = k; if (scr === 'orders' && k) S.ui.admOF = k; go.screen(scr); }
</script>

<HeroBand ey="Sellery Operations">
	셀러리 전체 <em>거래 현황</em>을 한눈에.
	{#snippet sub()}캠페인 <b>{cs.length}건</b> · 주문 <b>{fmt(os.length)}건</b> · 상품 <b>{D_().products.length}개</b> · 인플루언서 <b>{D_().sellers.length}명</b> · 브랜드 <b>{D_().brands.length}개</b> <button class="sm ghost" style="margin-left:12px" onclick={() => confirm('시드 데이터로 초기화할까요? 테스트 중 만든 데이터가 사라집니다.') && act.reset()}>데이터 초기화</button>{/snippet}
</HeroBand>
<div class="grid g4 overlap">
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('revenue')} onkeydown={(e) => e.key === 'Enter' && go.screen('revenue')}><div class="lbl">누적 GMV (확정)</div><div class="val">₩{fmt(gmv)}</div></div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('revenue')} onkeydown={(e) => e.key === 'Enter' && go.screen('revenue')}><div class="lbl">플랫폼 순수익 (VAT 제외)</div><div class="val" style="color:var(--red)">₩{fmt(net)}</div><div class="sub">순 테이크레이트 {gmv ? (net / gmv * 100).toFixed(2) : '0.00'}%</div></div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => (S.ui.admCF = 'LIVE')} onkeydown={(e) => e.key === 'Enter' && (S.ui.admCF = 'LIVE')}><div class="lbl">진행 중 판매</div><div class="val">{cs.filter((c) => c.status === 'LIVE').length}건</div><div class="sub">오늘 주문 {os.filter((o) => o.at === ymd(today())).length}건</div></div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('orders')} onkeydown={(e) => e.key === 'Enter' && go.screen('orders')}><div class="lbl">환불률</div><div class="val">{refRate.toFixed(1)}%</div><div class="sub">주문 {fmt(os.length)}건 기준</div></div>
</div>
<div class="grid g2" style="margin-top:18px">
	<div class="card"><div class="lbl-sm" style="margin-bottom:10px">✅ 오늘 할 일</div>
		{#each todo as [n, l, scr, k]}<div class="rowitem" role="button" tabindex="0" style="padding:8px 4px" onclick={() => admGo(scr, k)} onkeydown={(e) => e.key === 'Enter' && admGo(scr, k)}><div class="grow"><div class="nm" style="font-size:13px">{l}</div></div><span class="st {n ? 'amber' : 'gray'}" style="animation:none">{n}건</span></div>{/each}
	</div>
	<div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">🕒 최근 활동</div>
		<div class="news">{#each feed as x}{@const c = camp(x.cid)}{@const p = c && prod(c.productId)}<div class="news-item" role="button" tabindex="0" onclick={() => go.camp(x.cid)} onkeydown={(e) => e.key === 'Enter' && go.camp(x.cid)}><span class="nb new" style="min-width:52px;text-align:center">{md(P(x.at))}</span><div><b>{p ? p.name : x.cid}</b> · {@html x.txt}</div></div>{:else}<div class="empty">활동 없음</div>{/each}</div></div>
</div>
<Sec badge={flist.length}>전체 캠페인</Sec>
<Chips list={[['all', '전체', cs.length], ...stCounts]} cur={f} onpick={(k) => (S.ui.admCF = k)} />
<div class="tblw compact"><table>
	<thead><tr><th>캠페인</th><th>인플루언서</th><th>브랜드</th><th class="num">기간</th><th class="num">주문</th><th class="num">확정 매출</th><th class="num">플랫폼 순수익</th><th>상태</th></tr></thead>
	<tbody>
		{#each flist as c}{@const p = prod(c.productId)}{@const k = calc(c)}{@const sl = seller(c.sellerId)}
			<tr class="clickable" onclick={() => go.camp(c.id)}><td class="nm"><b><PIcon {p} sz={22} /> {p.name}</b> <span style="color:var(--mute);font-size:11px">{c.id.toUpperCase()}{c.auto ? ' · 🤖 자동' : ''}{c.invited && !c.auto ? ' · 브랜드 제안' : ''}</span></td><td class="who-cell">{@html platIcon(sl)}<span class="hd">{sl.handle}</span></td><td class="brd-cell">{brand(p.brandId).name}</td>
				<td class="num">{c.start ? md(P(c.start)) + '–' + md(P(c.end!)) : '—'}</td><td class="num">{k.paidCnt}{#if k.refCnt} <span style="color:var(--danger)">−{k.refCnt}</span>{/if}</td><td class="num">₩{fmt(k.net)}</td><td class="num">₩{fmt(k.pfNet)}</td><td><StChip st={c.status} /></td></tr>
		{:else}<tr><td colspan="8" class="empty">해당 상태의 캠페인이 없습니다</td></tr>{/each}
	</tbody></table></div>
