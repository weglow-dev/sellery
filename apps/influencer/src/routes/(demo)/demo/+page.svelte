<script lang="ts">
	/* 인플루언서 홈 (js/20-seller.js vSellerHome) */
	import { S, D_, seller, prod, brand, calc, campOrders, soldQty, sellerWht, gradeOf, gname, gfull, celBal, sampleLeft, exGradeOf, demoVisible, realFirst, platIcon, fmt, md, P, ymd, today, daysLeft, daysUntil, CEL, CELERY_PER, GRADES, ST, ACTIVE_BLOCKERS, act, openModal, go } from '@sellery/core';
	import { HeroBand, Sec, PIcon, StChip, CampRow, Pyramid, ProdCard } from '@sellery/ui';
	const me = $derived(S.actingSeller);
	const sl = $derived(seller(me));
	const mine = $derived(D_().campaigns.filter((c) => c.sellerId === me));
	const live = $derived(mine.filter((c) => c.status === 'LIVE'));
	const soon = $derived(mine.filter((c) => c.status === 'SCHEDULE_CONFIRMED'));
	const clearing = $derived(mine.filter((c) => c.status === 'CLEARING'));
	const liveNet = $derived(live.reduce((a, c) => a + calc(c).net, 0));
	const pendPay = $derived(clearing.reduce((a, c) => a + calc(c).sfTotal * (1 - sellerWht(sl)), 0));
	const monthPay = $derived(mine.filter((c) => c.status === 'SETTLED' && (c.settledAt || '').slice(0, 7) === ymd(today()).slice(0, 7)).reduce((a, c) => a + calc(c).sfTotal * (1 - sellerWht(sl)), 0));
	const todo = $derived(mine.filter((c) => ['INVITED', 'SAMPLE_SHIPPED', 'TESTING', 'SAMPLE_APPROVED', 'SAMPLE_PURCHASED'].includes(c.status)));
	const TODO_L: Record<string, string> = { INVITED: '브랜드 직접 제안 — 수락/거절', SAMPLE_SHIPPED: '샘플 수령 확인', TESTING: '테스트 후 일정 제안', SAMPLE_APPROVED: '샘플 배송 대기 (브랜드 발송 중)', SAMPLE_PURCHASED: '샘플 구매 완료 · 브랜드 발송 대기' };
	const g = $derived(gradeOf(sl.m3Sales));
	const next = $derived(GRADES[GRADES.indexOf(g) - 1]);
	const pct = $derived(next ? Math.min(100, Math.round(sl.m3Sales / next.min * 100)) : 100);
	const todayStr = ymd(today());
	const doneN = $derived(mine.filter((c) => ['SETTLED', 'CLEARING', 'LIVE'].includes(c.status)));
	const resell = $derived((() => { const pids = doneN.map((c) => c.productId); const rep = pids.filter((x, i) => pids.indexOf(x) !== i).length; return doneN.length ? Math.round(rep / doneN.length * 100) : 0; })());
	const left = $derived(sampleLeft(sl)), toNext = $derived(CELERY_PER - (sl.m3Sales % CELERY_PER));
	const listed = $derived(D_().products.filter((p) => p.status === 'listed' && demoVisible(p)));
	const hot = $derived(listed.filter((p) => p.t).sort((a, b) => parseInt(b.t!.g.replace(/\D/g, '')) - parseInt(a.t!.g.replace(/\D/g, '')))[0]);
	const exclOpen = $derived(listed.filter((p) => p.exclusive && !p.exclusiveSellerId).slice(0, 1));
	const fresh = $derived(listed.slice(-2).reverse());
	const recs = $derived(listed.filter((p) => !mine.some((c) => c.productId === p.id && !ACTIVE_BLOCKERS.includes(c.status))).sort((a, b) => realFirst(a, b) || (+(b.cat === sl.cat) - +(a.cat === sl.cat))).slice(0, 3));
	const now = new Date();
</script>

<HeroBand ey="Seller Gallery" avatar={sl.img || ''} onAvatar={() => go.screen('my')}>
	{sl.name}님, 반가워요.<br />
	{#if todo.length}기다리는 할 일이 <em>{todo.length}건</em> 있어요.{:else if live.length}지금 판매 <em>{live.length}건</em>이 진행 중이에요.{:else}오늘은 어떤 상품을 골라볼까요?{/if}
	{#snippet sub()}{@html platIcon(sl)} {sl.handle} · 팔로워 <b>{fmt(sl.followers)}</b> · 등급 <b>{@html gfull(gname(sl))}</b> · {now.getMonth() + 1}월 {now.getDate()}일{/snippet}
</HeroBand>

<Sec badge={todo.length}>지금 할 일</Sec>
<div class="listcard">
	{#each todo as c}
		{@const p = prod(c.productId)}{@const b = brand(p.brandId)}
		<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} />
			<div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {b.name}</span></div><div class="sub">{TODO_L[c.status] || ST[c.status].l}{c.testDue ? ` · 기한 ${md(P(c.testDue))}` : ''}</div></div>
			<button class="pri sm">{c.status === 'INVITED' ? '수락/거절' : c.status === 'SAMPLE_SHIPPED' ? '수령 확인' : c.status === 'TESTING' ? '일정 제안' : '스레드 보기'}</button></div>
	{:else}
		<div class="empty" style="padding:14px">지금 응답할 일이 없어요 — 진행 중 판매를 확인하세요 ✓</div>
	{/each}
</div>

<Sec>진행 중 · 예정 판매</Sec>
{#if live.length}
	<div class="grid {live.length > 1 ? 'g2' : ''}" style="margin-bottom:{soon.length || clearing.length ? '10px' : '0'}">
		{#each live as c}
			{@const p = prod(c.productId)}{@const k = calc(c)}{@const tod = campOrders(c.id).filter((o) => o.status === 'PAID' && o.at === todayStr)}{@const lft = (c.qty || 0) - soldQty(c.id)}
			<div class="card" style="padding:16px 18px">
				<div class="flex justify-between items-center gap-2.5 flex-wrap"><div class="flex items-center gap-2 min-w-0"><PIcon {p} sz={30} /><span class="min-w-0"><b style="font-size:15px">{p.name}</b> <span class="sub" style="color:var(--mute);font-size:12px">{brand(p.brandId).name} · 수수료 {(p.rate * 100).toFixed(0)}%</span></span></div><StChip st="LIVE" /></div>
				<div class="mini-stats" style="margin:12px 0 10px">
					<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmt(tod.reduce((a, o) => a + o.unit * o.qty, 0))}</span></div>
					<div><span class="ms-l">확정 매출</span><span class="ms-v">₩{fmt(k.net)}</span></div>
					<div><span class="ms-l">주문</span><span class="ms-v">{k.paidCnt}건</span></div>
					<div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-{daysLeft(c.end!)} · {fmt(Math.max(0, lft))}개</span></div>
				</div>
				<div class="btnrow one"><button class="sm ghost" onclick={() => go.camp(c.id)}>스레드</button><button class="sm ghost" onclick={() => go.store(c.id)}>구매 페이지</button><button class="sm ghost" onclick={() => act.copyLink(`sellery.co.kr/s/${sl.handle.slice(1)}/${c.id}`)}>링크 복사</button><button class="sm ghost" onclick={() => go.screen('sales')}>실시간 매출</button></div>
			</div>
		{/each}
	</div>
{/if}
{#if soon.length || clearing.length}
	<div class="listcard">
		{#each soon as c}{@const p = prod(c.productId)}
			<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} /><div class="grow"><div class="nm">{p.name}</div><div class="sub">{brand(p.brandId).name} · {md(P(c.start!))}–{md(P(c.end!))} · 재고 {fmt(c.qty || 0)}</div></div><span class="st blue" style="animation:none">오픈 D-{daysUntil(c.start!)}</span></div>
		{/each}
		{#each clearing as c}<CampRow {c} />{/each}
	</div>
{/if}
{#if !live.length && !soon.length && !clearing.length}<div class="listcard"><div class="empty">진행 중인 판매가 없습니다 — 상품 갤러리에서 시작해보세요</div></div>{/if}

<Sec>내 장부</Sec>
<div class="card" style="padding:16px 18px">
	<div class="mini-stats ledger4">
		<div class="go" role="button" tabindex="0" onclick={() => go.screen('sales')} onkeydown={(e) => e.key === 'Enter' && go.screen('sales')}><span class="ms-l">진행 중 판매 매출</span><span class="ms-v">₩{fmt(liveNet)}</span><span class="ms-s">확정 기준 · {live.length}건 LIVE</span></div>
		<div class="go" role="button" tabindex="0" onclick={() => go.screen('settle')} onkeydown={(e) => e.key === 'Enter' && go.screen('settle')}><span class="ms-l">정산 예정 수수료</span><span class="ms-v" style="color:var(--money)">₩{fmt(pendPay)}</span><span class="ms-s">환불기간 {clearing.length}건 · {sellerWht(sl) ? '원천징수 후' : '사업자 정산'}</span></div>
		<div class="go" role="button" tabindex="0" onclick={() => go.screen('settle')} onkeydown={(e) => e.key === 'Enter' && go.screen('settle')}><span class="ms-l">이번 달 확정 수익</span><span class="ms-v">₩{fmt(monthPay)}</span><span class="ms-s">정산 완료 기준</span></div>
		<div class="go" role="button" tabindex="0" onclick={() => go.screen('camps')} onkeydown={(e) => e.key === 'Enter' && go.screen('camps')}><span class="ms-l">누적 판매</span><span class="ms-v">{doneN.length}회</span><span class="ms-s">재판매율 {resell}%</span></div>
	</div>
</div>

<Sec>성장 · 자산</Sec>
<div class="grid g2">
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('rank')} onkeydown={(e) => e.key === 'Enter' && go.screen('rank')} title="랭킹·등급 보기">
		<div class="lbl-sm lbl">내 등급 — 상위 {g.pct}%</div>
		<Pyramid tiers={GRADES} cur={g.g} />
		{#if next}<div class="meter" style="margin-top:12px"><span style="width:{pct}%"></span></div><div style="font-size:12px;color:var(--mute);margin-top:7px">3개월 <b>₩{fmt(sl.m3Sales)}</b> · <b>{next.g}</b>까지 <b style="color:var(--red)">₩{fmt(next.min - sl.m3Sales)}</b> · 달성 시 {next.perk.split('·')[0].trim()}</div>
		{:else}<div style="font-size:12px;color:var(--mute);margin-top:10px">최고 등급 · {g.perk}</div>{/if}
	</div>
	<div class="card kpi go" role="button" tabindex="0" onclick={() => go.screen('shop')} onkeydown={(e) => e.key === 'Enter' && go.screen('shop')} title="셀러리 샵">
		<div class="lbl-sm lbl">내 자산</div>
		<div class="mini-stats" style="margin-top:10px">
			<div><span class="ms-l">셀러리</span><span class="ms-v flex items-center gap-1">{@html CEL} {celBal(me)}</span></div>
			<div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩{fmt(toNext)}</span></div>
			<div><span class="ms-l">이달 샘플 요청</span><span class="ms-v">{left}회 남음</span></div>
			<div><span class="ms-l">등급 보너스</span><span class="ms-v">+{g.bonus}%p</span></div>
		</div>
		<div class="btnrow" style="margin-top:12px"><button class="sm ghost" onclick={(e) => { e.stopPropagation(); go.screen('shop'); }}>셀러리 샵</button><button class="sm ghost" onclick={(e) => { e.stopPropagation(); go.screen('ref'); }}>친구 초대 · 2% 리워드</button></div>
	</div>
</div>

<Sec>지금 셀러리에서 · 추천 상품</Sec>
<div class="homegrid">
	<div class="card" style="padding:0;overflow:hidden">
		<div class="lbl-sm" style="padding:16px 18px 6px">📢 지금 셀러리에서</div>
		<div class="news">
			{#if hot}<div class="news-item" role="button" tabindex="0" onclick={() => openModal('productDetail', { pid: hot.id })} onkeydown={(e) => e.key === 'Enter' && openModal('productDetail', { pid: hot.id })}><span class="nb hot">폭주</span><div><b>{hot.name}</b> 진행 문의 폭주 — 최근 24시간 샘플 요청 12건 · 분기 매출 <b style="color:var(--danger)">▲{hot.t!.g.replace('+', '')}</b></div></div>{/if}
			{#each exclOpen as p}<div class="news-item" role="button" tabindex="0" onclick={() => openModal('productDetail', { pid: p.id })} onkeydown={(e) => e.key === 'Enter' && openModal('productDetail', { pid: p.id })}><span class="nb excl">독점</span><div><b>{p.name}</b> 독점권 오퍼 오픈 — {@html gfull(exGradeOf(p)!)} 등급 이상 신청 가능</div></div>{/each}
			{#each fresh as p}<div class="news-item" role="button" tabindex="0" onclick={() => openModal('productDetail', { pid: p.id })} onkeydown={(e) => e.key === 'Enter' && openModal('productDetail', { pid: p.id })}><span class="nb new">NEW</span><div><b>{p.name}</b> 신규 입점 — {brand(p.brandId).name} · {p.cat} · 수수료 {(p.rate * 100).toFixed(0)}%</div></div>{/each}
		</div>
	</div>
	<div class="grid g3" style="gap:14px">{#each recs as p}<ProdCard {p} />{/each}</div>
</div>
<div class="card flex justify-between items-center gap-3 flex-wrap" style="margin-top:22px;padding:14px 18px">
	<div><b>친구 초대 · 추천 프로그램</b> <span class="sub" style="color:var(--mute);font-size:12px">— 초대한 인플루언서 첫 5회 판매 확정매출의 2% 리워드 · 친구는 5회간 수수료 +1%p</span></div>
	<div class="btnrow" style="margin:0"><span class="st gray font-display" style="animation:none;font-weight:800">{sl.refCode}</span><button class="sm pri" onclick={() => act.copyRef(sl.refCode)}>코드 복사</button></div>
</div>
