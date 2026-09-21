<script lang="ts">
	/* 브랜드 홈 (js/40-brand.js vBrandHome) */
	import { S, D_, brand, seller, prod, calc, campOrders, soldQty, brandPending, csOpen, gname, gfull, bgname, bGmv, bgradeOf, exGradeOf, freeRefLeft, celBal, growthOf, platIcon, fmt, md, P, ymd, today, daysLeft, daysUntil, CEL, CELERY_PER, CATMAP, CAT_TRENDS, BGRADES, BREF_TIMES, ACTIVE_BLOCKERS, act, openModal, go } from '@sellery/core';
	import { HeroBand, Sec, PIcon, StChip, CampRow, Pyramid, GradeBox, Avatar } from '@sellery/ui';
	const me = $derived(S.actingBrand), bd = $derived(brand(me));
	const myP = $derived(D_().products.filter((p) => p.brandId === me)), myPid = $derived(myP.map((p) => p.id));
	const cs = $derived(D_().campaigns.filter((c) => myPid.includes(c.productId)));
	const pend = $derived(brandPending(me));
	const live = $derived(cs.filter((c) => c.status === 'LIVE')), soon = $derived(cs.filter((c) => c.status === 'SCHEDULE_CONFIRMED')), clearing = $derived(cs.filter((c) => c.status === 'CLEARING'));
	const liveNet = $derived(live.reduce((a, c) => a + calc(c).net, 0));
	const pendPay = $derived(clearing.reduce((a, c) => a + calc(c).brandPay, 0));
	const monthPay = $derived(cs.filter((c) => c.status === 'SETTLED' && (c.settledAt || '').slice(0, 7) === ymd(today()).slice(0, 7)).reduce((a, c) => a + calc(c).brandPay, 0));
	const cids = $derived(cs.map((c) => c.id));
	const unshipped = $derived(D_().orders.filter((o) => cids.includes(o.campaignId) && o.status === 'PAID' && !o.tracking).length);
	const openCS = $derived(csOpen(me).length);
	const todayStr = ymd(today());
	const LBL: Record<string, [string, string]> = { SAMPLE_REQUESTED: ['샘플 요청 검토', '검토'], SAMPLE_APPROVED: ['샘플 발송 처리', '발송'], SAMPLE_PURCHASED: ['샘플 발송 처리 (구매 완료)', '발송'], SCHEDULE_PROPOSED: ['일정 승인', '승인'] };
	const rel = $derived(CATMAP[bd.cat] || []);
	const recs3 = $derived(D_().sellers.filter((x) => !x.hidden && !cs.some((c) => c.sellerId === x.id && !ACTIVE_BLOCKERS.includes(c.status))).map((x) => ({ s: x, fit: rel.includes(x.cat), score: (rel.includes(x.cat) ? 2 : 0) + growthOf(x) / 50 + (x.m3Sales / x.followers) / 300 })).sort((a, b) => b.score - a.score).slice(0, 3));
	const views = $derived((D_().productViews || []).filter((v) => myPid.includes(v.productId)).slice(0, 3));
	const scout1 = $derived(D_().sellers.find((x) => x.hidden)), fresh1 = $derived(D_().sellers.filter((x) => !x.hidden).slice(-1)[0]);
	const pc = (k: string) => myP.filter((p) => p.status === k).length;
	const tops = $derived(D_().sellers.slice().sort((a, b) => b.m3Sales - a.m3Sales).slice(0, 5)), mxS = $derived(tops.length ? tops[0].m3Sales : 1);
	const gv = $derived(bGmv(bd)), bg = $derived(bgradeOf(gv)), bnext = $derived(BGRADES[BGRADES.indexOf(bg) - 1]), bpct = $derived(bnext ? Math.min(100, Math.round(gv / bnext.min * 100)) : 100);
	const freeLeft = $derived(freeRefLeft(bd)), toNext = $derived(CELERY_PER - (gv % CELERY_PER));
	const now = new Date();
</script>

<HeroBand ey="Brand Center" avatar={bd.logo || ''} onAvatar={() => go.screen('my')}>
	{bd.name} 님, 반가워요.<br />
	{#if pend.n}승인 대기 <em>{pend.n}건</em>부터 확인해볼까요?{:else if openCS}답변을 기다리는 고객 문의가 <em>{openCS}건</em> 있어요.{:else if unshipped}미발송 주문 <em>{unshipped}건</em>이 기다려요.{:else if live.length}지금 판매 <em>{live.length}건</em>이 진행 중이에요.{:else}새 상품을 올리고 인플루언서를 만나보세요.{/if}
	{#snippet sub()}브랜드 등급 <b>{@html gfull(bgname(bd))}</b> · 승인 대기 <b>{pend.n}건</b> · 진행 중 판매 <b>{live.length}건</b> · {now.getMonth() + 1}월 {now.getDate()}일{/snippet}
</HeroBand>

<Sec badge={pend.n}>승인·처리 대기</Sec>
<div class="listcard">
	{#each pend.cs as c}
		{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}{@const l = LBL[c.status]}
		<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} />
			<div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {@html platIcon(sl)} {sl.name} {sl.handle} <GradeBox g={gname(sl)} /></span></div>
				<div class="sub">{l[0]}{c.status === 'SCHEDULE_PROPOSED' && c.propStart ? ` · ${md(P(c.propStart))}–${md(P(c.propEnd!))} · 재고 ${fmt(c.propQty!)}` : ''} · 팔로워 {fmt(sl.followers)}</div></div>
			<button class="pri sm">{l[1]}</button></div>
	{/each}
	{#each pend.xr as r}
		{@const sl = seller(r.sellerId)}{@const p = prod(r.productId)}
		<div class="rowitem" style="cursor:default">
			<div class="grow"><div class="nm"><GradeBox g={gname(sl)} /> {@html platIcon(sl)} {sl.name} <span class="sub" style="font-weight:400">{sl.handle}</span> → {p.name} 독점권 신청</div><div class="sub">3개월 매출 ₩{fmt(sl.m3Sales)} · 팔로워 {fmt(sl.followers)} · 조건 {@html gfull(exGradeOf(p)!)} 이상 충족 ✓{sl.hidden ? ' · 비공개 프로필(신청으로 공개)' : ''}</div></div>
			<div class="rowacts"><button class="pri sm" onclick={() => act.approveExcl(r.id)}>승인</button><button class="sm danger" onclick={() => act.rejectExcl(r.id)}>거절</button></div></div>
	{/each}
	{#if !pend.n}<div class="empty" style="padding:14px">대기 중인 요청이 없습니다 ✓</div>{/if}
</div>

<Sec>진행 중 · 확정 판매</Sec>
{#if live.length}
	<div class="grid {live.length > 1 ? 'g2' : ''}" style="margin-bottom:{soon.length || clearing.length ? '10px' : '0'}">
		{#each live as c}
			{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}{@const k = calc(c)}{@const os = campOrders(c.id).filter((o) => o.status === 'PAID')}{@const tod = os.filter((o) => o.at === todayStr)}{@const un = os.filter((o) => !o.tracking).length}{@const lft = (c.qty || 0) - soldQty(c.id)}
			<div class="card" style="padding:16px 18px">
				<div class="flex justify-between items-center gap-2.5 flex-wrap"><div class="flex items-center gap-2 min-w-0"><PIcon {p} sz={30} /><span class="min-w-0"><b style="font-size:15px">{p.name}</b> <span class="sub" style="color:var(--mute);font-size:12px">{@html platIcon(sl)} {sl.name} {sl.handle} · 수수료 {(p.rate * 100).toFixed(0)}%</span></span></div><div class="flex gap-1.5 items-center">{#if un}<span class="st amber" style="animation:none">미발송 {un}건</span>{/if}<StChip st="LIVE" /></div></div>
				<div class="mini-stats" style="margin:12px 0 10px">
					<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmt(tod.reduce((a, o) => a + o.unit * o.qty, 0))}</span></div>
					<div><span class="ms-l">확정 매출</span><span class="ms-v">₩{fmt(k.net)}</span></div>
					<div><span class="ms-l">주문</span><span class="ms-v">{k.paidCnt}건</span></div>
					<div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-{daysLeft(c.end!)} · {fmt(Math.max(0, lft))}개</span></div>
				</div>
				<div class="btnrow one"><button class="sm ghost" onclick={() => go.camp(c.id)}>스레드</button><button class="sm ghost" onclick={() => go.store(c.id)}>구매 페이지</button><button class="sm ghost" onclick={() => act.poCSV()}>발주서 CSV</button><button class="sm ghost" onclick={() => go.screen('sales')}>실시간 매출</button></div>
			</div>
		{/each}
	</div>
{/if}
{#if soon.length || clearing.length}
	<div class="listcard">
		{#each soon as c}{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}
			<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} /><div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {@html platIcon(sl)} {sl.name}</span></div><div class="sub">{md(P(c.start!))}–{md(P(c.end!))} · 배정 재고 {fmt(c.qty || 0)}</div></div><span class="st blue" style="animation:none">오픈 D-{daysUntil(c.start!)}</span></div>
		{/each}
		{#each clearing as c}<CampRow {c} who="brand" />{/each}
	</div>
{/if}
{#if !live.length && !soon.length && !clearing.length}<div class="listcard"><div class="empty">진행 중 판매 없음 — 인플루언서 갤러리에서 제안해보세요</div></div>{/if}

<Sec>내 장부</Sec>
<div class="card" style="padding:16px 18px"><div class="mini-stats ledger4">
	<div class="go" role="button" tabindex="0" onclick={() => go.screen('sales')} onkeydown={(e) => e.key === 'Enter' && go.screen('sales')}><span class="ms-l">진행 중 판매 매출</span><span class="ms-v">₩{fmt(liveNet)}</span><span class="ms-s">확정 기준 · {live.length}건 LIVE</span></div>
	<div class="go" role="button" tabindex="0" onclick={() => go.screen('settle')} onkeydown={(e) => e.key === 'Enter' && go.screen('settle')}><span class="ms-l">정산 예정액</span><span class="ms-v" style="color:var(--money)">₩{fmt(pendPay)}</span><span class="ms-s">환불기간 {clearing.length}건 · 브랜드 정산 기준</span></div>
	<div class="go" role="button" tabindex="0" onclick={() => go.screen('settle')} onkeydown={(e) => e.key === 'Enter' && go.screen('settle')}><span class="ms-l">이번 달 확정 정산</span><span class="ms-v">₩{fmt(monthPay)}</span><span class="ms-s">정산 완료 기준</span></div>
	<div class="go" role="button" tabindex="0" onclick={() => go.screen('orders')} onkeydown={(e) => e.key === 'Enter' && go.screen('orders')}><span class="ms-l">미발송 주문</span><span class="ms-v" style={unshipped ? 'color:var(--danger)' : ''}>{unshipped}건</span><span class="ms-s">송장 업로드 → 배송중</span></div>
</div></div>

<Sec>인플루언서 찾기</Sec>
<div class="grid g2">
	<div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">✦ {bd.name} 맞춤 추천</div>
		<div class="listcard" style="margin:0;box-shadow:none">
			{#each recs3 as r}
				<div class="rowitem" role="button" tabindex="0" onclick={() => openModal('sellerProfile', { sid: r.s.id })} onkeydown={(e) => e.key === 'Enter' && openModal('sellerProfile', { sid: r.s.id })} title="프로필 · 데이터 보기"><Avatar s={r.s} sz={40} /><div class="grow min-w-0"><div class="nm"><GradeBox g={gname(r.s)} /> {r.s.name} <span style="color:var(--mute);font-weight:400;font-size:12px">{@html platIcon(r.s)} {r.s.handle}</span></div><div class="sub truncate">{r.fit ? '카테고리 적합' : '매출 효율 상위'} · 성장세 ▲{growthOf(r.s).toFixed(1)}% · {r.s.cat} · 3개월 ₩{fmt(r.s.m3Sales)}</div></div><button class="pri sm" onclick={(e) => { e.stopPropagation(); openModal('invite', { sid: r.s.id }); }}>제안</button></div>
			{:else}<div class="empty">추천할 인플루언서가 없습니다</div>{/each}
		</div>
		<div style="padding:10px 18px"><button class="sm ghost" onclick={() => go.screen('gallery')}>갤러리에서 더 보기 →</button></div></div>
	<div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">👀 내 상품을 조회한 인플루언서</div>
		<div class="listcard" style="margin:0;box-shadow:none">
			{#each views as v}{@const sl = seller(v.sellerId)}{@const p = prod(v.productId)}
				<div class="rowitem" role="button" tabindex="0" onclick={() => openModal('sellerProfile', { sid: sl.id })} onkeydown={(e) => e.key === 'Enter' && openModal('sellerProfile', { sid: sl.id })}><Avatar s={sl} sz={40} /><div class="grow min-w-0"><div class="nm"><GradeBox g={gname(sl)} /> {sl.name} <span style="color:var(--mute);font-weight:400;font-size:12px">{@html platIcon(sl)} {sl.handle}</span></div><div class="sub truncate"><PIcon {p} sz={18} /> {p.name} 조회 · {v.ago} · 팔로워 {fmt(sl.followers)} · 참여율 {(sl.likesAvg / sl.followers * 100).toFixed(1)}%</div></div><button class="pri sm" onclick={(e) => { e.stopPropagation(); openModal('invite', { sid: sl.id }); }}>제안</button></div>
			{:else}<div class="empty">최근 조회 기록이 없습니다</div>{/each}
		</div></div>
</div>

<Sec>소식 · 상품 현황</Sec>
<div class="homegrid3">
	<div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">📢 인플루언서 소식</div>
		<div class="news">
			<div class="news-item" role="button" tabindex="0" onclick={() => go.screen('gallery')} onkeydown={(e) => e.key === 'Enter' && go.screen('gallery')}><span class="nb hot">급증</span><div><b>{CAT_TRENDS[0].cat}</b> 인플루언서 활동 급증 — {CAT_TRENDS[0].note}</div></div>
			{#if scout1}<div class="news-item" role="button" tabindex="0" onclick={() => act.topSeller(scout1.id)} onkeydown={(e) => e.key === 'Enter' && act.topSeller(scout1.id)}><span class="nb excl">스카우트</span><div>{@html gfull(gname(scout1))} <b>○○○ 인플루언서</b> 프로필 공개 — 3개월 ₩{fmt(scout1.m3Sales)} · {scout1.cat}</div></div>{/if}
			{#if fresh1}<div class="news-item" role="button" tabindex="0" onclick={() => go.screen('gallery')} onkeydown={(e) => e.key === 'Enter' && go.screen('gallery')}><span class="nb new">NEW</span><div><b>{fresh1.name} {fresh1.handle}</b> 신규 합류 — {fresh1.cat} · 팔로워 {fmt(fresh1.followers)}</div></div>{/if}
		</div></div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('products')} onkeydown={(e) => e.key === 'Enter' && go.screen('products')} title="상품 관리"><div class="lbl-sm lbl">상품 현황</div>
		<div class="mini-stats" style="margin-top:10px"><div><span class="ms-l">노출 중</span><span class="ms-v">{pc('listed')}</span></div><div><span class="ms-l">검수 대기</span><span class="ms-v">{pc('pending')}</span></div><div><span class="ms-l">노출 중단</span><span class="ms-v">{pc('paused')}</span></div><div><span class="ms-l">독점 오퍼</span><span class="ms-v">{myP.filter((p) => p.exclusive).length}</span></div></div>
		<div class="btnrow" style="margin-top:12px"><button class="sm pri" onclick={(e) => { e.stopPropagation(); openModal('product', { pid: null }); }}>+ 새 상품 등록</button><button class="sm ghost" onclick={(e) => { e.stopPropagation(); go.screen('products'); }}>상품 관리</button></div></div>
	<div class="card"><div class="lbl-sm" style="margin-bottom:4px">지금 잘 파는 인플루언서 TOP5</div>
		<div style="font-size:11px;color:var(--mute);margin-bottom:10px">3개월 확정 매출 · 클릭 시 제안 · 비공개는 {@html CEL}로 열람</div>
		{#each tops as x, i}<div class="hb-row" role="button" tabindex="0" onclick={() => act.topSeller(x.id)} onkeydown={(e) => e.key === 'Enter' && act.topSeller(x.id)}><span class="hb-nm">{i + 1}. {@html platIcon(x)} {x.hidden ? '○○○ 인플루언서' : x.name + ' ' + x.handle}</span><div class="hb-track"><div class="hb-bar {i === 0 ? 'top' : ''}" style="width:{Math.max(6, x.m3Sales / mxS * 100)}%"></div></div><span class="hb-val">₩{fmt(x.m3Sales)}</span></div>{/each}</div>
</div>

<Sec>등급 · 자산</Sec>
<div class="grid g2">
	<div class="card kpi go" role="button" tabindex="0" onclick={() => openModal('brandGrade')} onkeydown={(e) => e.key === 'Enter' && openModal('brandGrade')} title="등급별 혜택 보기"><div class="lbl-sm lbl">브랜드 등급 — 상위 {bg.pct}%</div>
		<Pyramid tiers={BGRADES} cur={bg.g} />
		{#if bnext}<div class="meter" style="margin-top:12px"><span style="width:{bpct}%"></span></div><div style="font-size:12px;color:var(--mute);margin-top:7px">누적 <b>₩{fmt(gv)}</b> · <b>{bnext.g}</b>까지 <b style="color:var(--red)">₩{fmt(bnext.min - gv)}</b> · 달성 시 {bnext.perk.split('·')[0].trim()}</div>{:else}<div style="font-size:12px;color:var(--mute);margin-top:8px">최고 등급 · {bg.perk}</div>{/if}</div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('shop')} onkeydown={(e) => e.key === 'Enter' && go.screen('shop')} title="셀러리 샵"><div class="lbl-sm lbl">내 자산</div>
		<div class="mini-stats" style="margin-top:10px">
			<div><span class="ms-l">셀러리</span><span class="ms-v flex items-center gap-1">{@html CEL} {celBal(me)}</span></div>
			<div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩{fmt(toNext)}</span></div>
			<div><span class="ms-l">무료 데이터 열람</span><span class="ms-v">{(bg.g === '다이아' || bg.g === '블랙') ? freeLeft + '회 남음' : '다이아↑ 혜택'}</span></div>
			<div><span class="ms-l">자동 제안</span><span class="ms-v">{bd.autoPropose ? 'ON' : 'OFF'}</span></div>
		</div>
		<div class="btnrow" style="margin-top:12px"><button class="sm ghost" onclick={(e) => { e.stopPropagation(); go.screen('shop'); }}>셀러리 샵</button><button class="sm ghost" onclick={(e) => { e.stopPropagation(); go.screen('my'); }}>마이페이지</button></div></div>
</div>
<div class="card flex justify-between items-center gap-3 flex-wrap" style="margin-top:22px;padding:14px 18px">
	<div><b>브랜드 추천 프로그램</b> <span class="sub" style="color:var(--mute);font-size:12px">— 새 브랜드 첫 {BREF_TIMES}회 판매 확정매출의 1% 리워드 · 새 브랜드는 {BREF_TIMES}회간 플랫폼 수수료 −1%p{bd.referredBy ? ` · 🌱 ${brand(bd.referredBy).name} 추천으로 입점 중` : ''}</span></div>
	<div class="btnrow" style="margin:0"><span class="st gray font-display" style="animation:none;font-weight:800">{bd.refCode || '—'}</span><button class="sm pri" onclick={() => act.copyBrandRef(bd.refCode || '')}>코드 복사</button><button class="sm ghost" onclick={() => go.screen('my')}>추천 현황</button></div>
</div>
