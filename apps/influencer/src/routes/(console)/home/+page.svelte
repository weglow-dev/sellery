<script lang="ts">
	/**
	 * 콘솔 홈 — 프로토타입 vSellerHome(js/20-seller.js) 의 3위젯: 지금 할 일(rowitem + 액션 버튼) · 진행 중 판매(LIVE 카드 · mini-stats 오늘/누적 매출·주문 · 링크) · 내 자산(🥬 · 등급 · 다음 등급까지 · 정산 정보 — "이달 무상 샘플" 칸은 0047 월 한도 폐지로 제거).
	 * 데이터는 전부 서버(`getHomeWidgets`) — 할 일은 kind 별 href/action, 매출은 PAID 주문 집계(샘플 제외). 실시간 매출·정산은 5단계 `/sales` `/settle`(내 자산의 정산 정보 칸 · 버튼) — 추천 상품·랭킹 피라미드는 이후.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { CopyButton, GradeBox, LiveClock, LiveRefresh, PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const seller = $derived(data.seller);
	const a = $derived(data.assets);
	const today = kstToday();
	const pct = $derived(a.next ? Math.min(100, Math.round((a.m3_sales / Math.max(1, a.next.min)) * 100)) : 100);
	const TODO_ICON: Record<string, string> = { channel_verify: '✅', channel_pending: '⏳', bank_info: '🏦', invited: '📩', receive_sample: '📦', testing: '🧪', schedule_proposed: '📅', first_product: '🛍' };
</script>

<svelte:head>
	<title>홈 — 셀러리 파트너</title>
</svelte:head>

<!-- 할 일(승인 · 발송 · 일정 확정)은 브랜드 쪽 행동으로 생긴다 — 탭이 보이는 동안 20초마다 다시 읽는다 -->
<LiveRefresh refresh={() => invalidate('console:home')} intervalMs={20_000} />

<div class="console-head">
	<h2>{seller.name} 님, 반가워요.</h2>
	<GradeBox grade={seller.grade} sm />
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<!-- 상단 요약 — 칩 한 줄 + 실시간 시계 (대표 요청 2026-10-08) -->
<div class="home-meta">
	<div class="home-chips">
		<span class="hchip"><PlatformHandle platform={seller.platform} handle={seller.handle} /></span>
		<span class="hchip"><span class="k">팔로워</span><b>{fmtNum(seller.followers)}</b></span>
		{#if data.todos.length}
			<span class="hchip todo"><span class="k">할 일</span><b>{data.todos.length}건</b></span>
		{:else if data.live.length}
			<span class="hchip live"><span class="k">판매 중</span><b>{data.live.length}건</b></span>
		{:else}
			<span class="hchip"><span class="k">오늘</span><b>어떤 상품을 골라볼까요?</b></span>
		{/if}
	</div>
	<LiveClock />
</div>

{#if seller.ref_code}
	<!-- 추천 프로그램 배너 — 대표 결정 2026-10-08: 버튼 대신 할 일 위에 혜택을 강조해 바이럴을 유도한다 (수치는 constants REF_RATE/REF_BOOST/REF_TIMES) -->
	<a href={data.referralPath} class="card static ref-banner">
		<div class="grow">
			<div class="lbl-sm">추천 프로그램</div>
			<div class="nm">인플루언서 친구를 추천하면 <b>첫 5회 판매 확정 매출의 2%</b>를 받아요 — 친구는 <b>수수료 +1%p</b></div>
			<div class="sub">둘 다 셀러리가 부담해요 · 내 추천 코드 <span class="console-code sm">{seller.ref_code}</span></div>
		</div>
		<span class="btn sm pri" aria-hidden="true">자세히 →</span>
	</a>
{/if}

<div class="sec">지금 할 일 {#if data.todos.length}<span class="badge">{data.todos.length}</span>{/if}</div>
<div class="listcard console-rows">
	{#each data.todos as t (t.kind + (t.campaignCode ?? ''))}
		<a href={t.href} class="rowitem">
			<span class="plat" aria-hidden="true">{TODO_ICON[t.kind] ?? '•'}</span>
			<div class="grow">
				<div class="nm">{t.title}</div>
				<div class="sub">{t.desc}</div>
			</div>
			{#if t.action}<span class="btn pri sm">{t.action}</span>{:else}<span class="btn ghost sm">보기</span>{/if}
		</a>
	{:else}
		<div class="empty" style="padding:14px">지금 응답할 일이 없어요.</div>
	{/each}
</div>

<div class="sec" style="margin-top:22px">진행 중 판매</div>
{#if data.live.length}
	<div class="console-live {data.live.length > 1 ? 'grid2' : ''}">
		{#each data.live as c (c.code)}
			{@const left = c.end_date ? daysBetween(today, c.end_date) : NaN}
			<div class="card static">
				<div class="hd">
					<div class="ttl">
						<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={30} />
						<span style="min-width:0"><b>{c.product.name}</b> <span class="sub">₩{fmtNum(c.product.sale_price)}</span></span>
					</div>
					<StatusChip tone="live">{c.chip.label}</StatusChip>
				</div>
				<div class="mini-stats">
					<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmtNum(c.today_sales)}</span><span class="ms-s">{c.today_orders}건</span></div>
					<div><span class="ms-l">누적 매출</span><span class="ms-v">₩{fmtNum(c.total_sales)}</span><span class="ms-s">주문 {c.total_orders}건</span></div>
					<div><span class="ms-l">판매 · 잔여</span><span class="ms-v">{fmtNum(c.sold_qty)}개</span><span class="ms-s">잔여 {fmtNum(Math.max(0, c.qty - c.sold_qty))}개</span></div>
					<div><span class="ms-l">마감</span><span class="ms-v">{Number.isNaN(left) ? '—' : `D-${Math.max(0, left)}`}</span><span class="ms-s">{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'}</span></div>
				</div>
				<div class="btnrow">
					<a href={c.href} class="btn sm ghost">스레드</a>
					<a href={c.storeUrl} class="btn sm ghost" target="_blank" rel="noopener">구매 페이지</a>
					<CopyButton text={c.storeUrl} label="링크 복사" />
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="listcard"><div class="empty">진행 중인 판매가 없습니다.<br /><a href={data.productsPath} style="text-decoration:underline">상품 갤러리</a>에서 시작해보세요.</div></div>
{/if}

<div class="sec" style="margin-top:22px">내 자산</div>
<div class="card static">
	<div class="lbl-sm" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>내 등급 — {a.grade}</span><a href={data.rankingPath} class="meta" style="text-decoration:underline">랭킹·등급 가이드 →</a></div>
	{#if a.next}
		<div class="meter" style="margin-top:10px"><span style="width:{pct}%"></span></div>
		<div class="meta" style="margin-top:7px">3개월 확정 매출 <b>₩{fmtNum(a.m3_sales)}</b> · <b>{a.next.grade}</b>까지 <b style="color:var(--color-accent)">₩{fmtNum(a.next.remaining)}</b></div>
	{:else}
		<div class="meta" style="margin-top:8px">최고 등급 · 3개월 확정 매출 <b>₩{fmtNum(a.m3_sales)}</b></div>
	{/if}
	<div class="mini-stats" style="margin-bottom:0">
		<div><span class="ms-l">셀러리</span><span class="ms-v">🥬 {a.balance}</span></div>
		<div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩{fmtNum(data.toNextCel)}</span></div>
		<div><span class="ms-l">정산 정보</span><span class="ms-v">{seller.has_bank_info ? '등록 완료' : '미등록'}</span><span class="ms-s">{seller.has_bank_info ? 'D+21 지급' : '정산 화면에서 등록'}</span></div>
	</div>
	<p class="meta" style="margin-top:10px">등급은 최근 3개월 확정 매출로 <b>매월 1일</b> 다시 계산돼요 — 판매가 없으면 등급이 내려갈 수 있어요. 정산은 실행 시점 등급으로 지급되고, 🥬 는 확정 매출 ₩500만당 1개씩 쌓여요.</p>
</div>
