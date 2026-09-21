<script lang="ts">
	/**
	 * 콘솔 홈 — 프로토타입 vSellerHome(js/20-seller.js) 의 3위젯: 지금 할 일(rowitem + 액션 버튼) · 진행 중 판매(LIVE 카드 · mini-stats 오늘/누적 매출·주문 · 링크) · 내 자산(🥬 · 등급 · 다음 등급까지 · 샘플 한도).
	 * 데이터는 전부 서버(`getHomeWidgets`) — 할 일은 kind 별 href/action, 매출은 PAID 주문 집계(샘플 제외). 실시간 매출·정산은 5단계 `/sales` `/settle`(내 자산의 정산 정보 칸 · 버튼) — 추천 상품·랭킹 피라미드는 이후.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { CopyButton, GradeBox, PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const seller = $derived(data.seller);
	const a = $derived(data.assets);
	const today = kstToday();
	const pct = $derived(a.next ? Math.min(100, Math.round((a.m3_sales / Math.max(1, a.next.min)) * 100)) : 100);
	const now = new Date();
	const TODO_ICON: Record<string, string> = { channel_verify: '✅', channel_pending: '⏳', bank_info: '🏦', invited: '📩', receive_sample: '📦', testing: '🧪', schedule_proposed: '📅', first_product: '🛍' };
</script>

<svelte:head>
	<title>홈 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>{seller.name} 님, 반가워요.</h2>
	<GradeBox grade={seller.grade} sm />
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">
	<PlatformHandle platform={seller.platform} handle={seller.handle} /> · 팔로워 <b>{fmtNum(seller.followers)}</b> · 등급 <b>{a.grade}</b> · {now.getMonth() + 1}월 {now.getDate()}일{#if data.todos.length}{' '}· 기다리는 할 일이 <b>{data.todos.length}건</b> 있어요.{:else if data.live.length}{' '}· 지금 판매 <b>{data.live.length}건</b>이 진행 중이에요.{:else}{' '}· 오늘은 어떤 상품을 골라볼까요?{/if}
</p>

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
		<div class="empty" style="padding:14px">지금 응답할 일이 없어요 — 진행 중 판매를 확인하세요 ✓</div>
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
	<div class="listcard"><div class="empty">진행 중인 판매가 없습니다 — <a href={data.productsPath} style="text-decoration:underline">상품 갤러리</a>에서 시작해보세요</div></div>
{/if}

<div class="sec" style="margin-top:22px">내 자산</div>
<div class="card static">
	<div class="lbl-sm">내 등급 — {a.grade}</div>
	{#if a.next}
		<div class="meter" style="margin-top:10px"><span style="width:{pct}%"></span></div>
		<div class="meta" style="margin-top:7px">3개월 확정 매출 <b>₩{fmtNum(a.m3_sales)}</b> · <b>{a.next.grade}</b>까지 <b style="color:var(--color-accent)">₩{fmtNum(a.next.remaining)}</b></div>
	{:else}
		<div class="meta" style="margin-top:8px">최고 등급 · 3개월 확정 매출 <b>₩{fmtNum(a.m3_sales)}</b></div>
	{/if}
	<div class="mini-stats" style="margin-bottom:0">
		<div><span class="ms-l">셀러리</span><span class="ms-v">🥬 {a.balance}</span></div>
		<div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩{fmtNum(data.toNextCel)}</span></div>
		<div><span class="ms-l">이달 무상 샘플</span><span class="ms-v">{a.sample.left}회 남음</span><span class="ms-s">한도 {a.sample.quota + a.sample.extra}회 · 사용 {a.sample.used}회</span></div>
		<div><span class="ms-l">정산 정보</span><span class="ms-v">{seller.has_bank_info ? '등록 완료' : '미등록'}</span><span class="ms-s">{seller.has_bank_info ? 'D+21 지급' : '정산 화면에서 등록'}</span></div>
	</div>
	<p class="meta" style="margin-top:10px">등급은 최근 3개월 확정 매출로 매달 다시 계산되고, 🥬 는 확정 매출 ₩500만당 1개씩 쌓여요.</p>
	<div class="btnrow" style="margin-top:10px">
		<a href={data.productsPath} class="btn sm ghost">상품 갤러리</a>
		<a href={data.campaignsPath} class="btn sm ghost">내 캠페인</a>
		<a href={data.salesPath} class="btn sm ghost">실시간 매출</a>
		<a href={data.myPath} class="btn sm ghost">내 정보</a>
	</div>
</div>
