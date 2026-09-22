<script lang="ts">
	/**
	 * 브랜드 콘솔 홈 — 2단계 위젯: 환영 줄(상호 · 카테고리 · 등급 · 🥬) · 지금 할 일(샘플 요청 · 발송 대기 · 일정 승인 · 검수/반려 · 재고 · 정산 정보 → 각 화면) · 진행 중·확정 판매 · 상품 현황 · 브랜드 카드.
	 * 프로토타입 js/40-brand.js vBrandHome 의 "승인·처리 대기" · "진행 중 · 확정 판매" · "상품 현황" 카드 문구를 그대로 — 5단계: LIVE 카드 [실시간 매출] → /sales · 정산 정보 → /settle · 브랜드 카드 → /my(등급 카드). 인플루언서 찾기는 6단계.
	 * 데이터는 전부 서버(`+page.server.ts`). 클래스는 인플루언서 홈과 같은 site.css `.console-*` · `.listcard` · `.rowitem` · `.mini-stats` · `.console-live`.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { CopyButton, GradeBox, PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const brand = $derived(data.brand);
	const today = kstToday();
	const now = new Date();
	const joined = $derived(new Date(brand.created_at));
</script>

<svelte:head>
	<title>홈 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>{brand.name}, 반가워요.</h2>
	<GradeBox grade={brand.grade} sm />
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">
	{brand.category} · 담당 <b>{brand.manager_name ?? '—'}</b> · 브랜드 코드 <b>{brand.code ?? '—'}</b> · 입점 {joined.getFullYear()}.{joined.getMonth() + 1}.{joined.getDate()} · {now.getMonth() + 1}월 {now.getDate()}일
	{#if data.pending}{' '}· 승인 대기 <b>{data.pending}건</b>부터 확인해볼까요?{:else if data.live.length}{' '}· 지금 판매 <b>{data.live.length}건</b>이 진행 중이에요.{:else}{' '}· 새 상품을 올리고 인플루언서를 만나보세요.{/if}
</p>

<div class="sec">지금 할 일 {#if data.todos.length}<span class="badge">{data.todos.length}</span>{/if}</div>
<div class="listcard console-rows">
	{#each data.todos as t (t.kind)}
		<a href={t.href} class="rowitem">
			<span class="plat" aria-hidden="true">{t.icon}</span>
			<div class="grow">
				<div class="nm">{t.title}</div>
				<div class="sub">{t.desc}</div>
			</div>
			{#if t.action}<span class="btn pri sm">{t.action}</span>{:else}<span class="btn ghost sm">보기</span>{/if}
		</a>
	{:else}
		<div class="empty" style="padding:14px">대기 중인 요청이 없습니다 ✓</div>
	{/each}
</div>

<div class="sec" style="margin-top:22px">진행 중 · 확정 판매 {#if data.live.length}<span class="badge">{data.live.length}</span>{/if}</div>
{#if data.live.length}
	<div class="console-live {data.live.length > 1 ? 'grid2' : ''}">
		{#each data.live as c (c.code)}
			{@const left = c.end_date ? daysBetween(today, c.end_date) : NaN}
			<div class="card static">
				<div class="hd">
					<div class="ttl">
						<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={30} />
						<span style="min-width:0"><b>{c.product.name}</b> <span class="sub"><PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} /> · 수수료 {(c.product.commission_rate * 100).toFixed(0)}%</span></span>
					</div>
					<StatusChip tone="live">{c.chip.label}</StatusChip>
				</div>
				<div class="mini-stats">
					<div><span class="ms-l">판매가</span><span class="ms-v">₩{fmtNum(c.product.sale_price)}</span></div>
					<div><span class="ms-l">판매 · 배정</span><span class="ms-v">{fmtNum(c.sold_qty)} / {fmtNum(c.qty)}개</span></div>
					<div><span class="ms-l">기간</span><span class="ms-v">{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'}</span></div>
					<div><span class="ms-l">마감 · 잔여</span><span class="ms-v">{Number.isNaN(left) ? '—' : `D-${Math.max(0, left)}`} · {fmtNum(Math.max(0, c.qty - c.sold_qty))}개</span></div>
				</div>
				<div class="btnrow">
					<a href={c.href} class="btn ghost sm">스레드</a>
					<a href={c.storeUrl} class="btn ghost sm" target="_blank" rel="noopener">구매 페이지</a>
					<CopyButton text={c.storeUrl} label="링크 복사" />
					<a href={c.ordersHref} class="btn ghost sm">주문 · 발주</a>
					<a href={c.salesHref} class="btn ghost sm">실시간 매출</a>
				</div>
			</div>
		{/each}
	</div>
{/if}
{#if data.soon.length || data.clearing}
	<div class="listcard console-rows">
		{#each data.soon as c (c.code)}
			<a href={c.href} class="rowitem">
				<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={38} />
				<div class="grow">
					<div class="nm">{c.product.name} <span class="sub">· <PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} /></span></div>
					<div class="sub">{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'} · 배정 재고 {fmtNum(c.qty)}</div>
				</div>
				{#if c.start_date}<span class="st blue" style="animation:none">오픈 D-{Math.max(0, daysBetween(today, c.start_date))}</span>{/if}
			</a>
		{/each}
		{#if data.clearing}
			<a href={`${data.campaignsPath}?f=done`} class="rowitem">
				<span class="plat" aria-hidden="true">🧾</span>
				<div class="grow"><div class="nm">교환·환불 기간 {data.clearing}건</div><div class="sub">종료 후 21일이 지나면 정산돼요 — 예상 정산액은 실시간 매출, 명세는 정산 화면에서</div></div>
				<span class="btn ghost sm">보기</span>
			</a>
		{/if}
	</div>
{/if}
{#if !data.live.length && !data.soon.length && !data.clearing}
	<div class="listcard"><div class="empty">진행 중 판매 없음 — 상품을 등록하고 검수를 통과하면 인플루언서가 샘플을 요청해요</div></div>
{/if}
<div class="btnrow" style="margin:10px 3px 0"><a href={data.campaignsPath} class="btn ghost sm">내 캠페인 전체 {data.campaignsTotal}건 →</a></div>

<div class="sec" style="margin-top:22px">상품 현황 · 브랜드</div>
<div class="console-grid2">
	<div class="card static">
		<div class="lbl-sm">상품 현황</div>
		<div class="mini-stats" style="margin-top:10px">
			<div><span class="ms-l">노출 중</span><span class="ms-v">{data.products.listed}</span></div>
			<div><span class="ms-l">검수 대기</span><span class="ms-v">{data.products.pending}</span></div>
			<div><span class="ms-l">노출 중단</span><span class="ms-v">{data.products.paused}</span></div>
			<div><span class="ms-l">독점 오퍼</span><span class="ms-v">{data.products.exclusive}</span></div>
		</div>
		{#if data.products.rejected}<p class="meta" style="margin:0 0 8px">반려 <b>{data.products.rejected}건</b> — 수정 후 저장하면 다시 검수를 요청합니다.</p>{/if}
		<div class="btnrow"><a href={data.newProductPath} class="btn pri sm">+ 새 상품 등록</a><a href={data.productsPath} class="btn ghost sm">상품 관리</a></div>
	</div>
	<div class="card static">
		<div class="lbl-sm">브랜드</div>
		<div class="mini-stats" style="margin-top:10px">
			<div><span class="ms-l">브랜드 등급</span><span class="ms-v">{brand.grade ?? '스타터'}</span><span class="ms-s">누적 확정 매출로 매달 재계산</span></div>
			<div><span class="ms-l">셀러리</span><span class="ms-v">🥬 {data.balance}</span><span class="ms-s">입점 이벤트 지급 포함</span></div>
			<div><span class="ms-l">정산 정보</span><span class="ms-v">{brand.has_bank_info ? '등록 완료' : '미등록'}</span><span class="ms-s">{brand.has_biz_doc ? '사업자등록증 있음' : '사업자등록증 없음'}</span></div>
			<div><span class="ms-l">추천 코드</span><span class="ms-v">{brand.ref_code ?? '—'}</span><span class="ms-s">추천 브랜드 첫 3회 판매 1%</span></div>
		</div>
		<p class="meta" style="margin:0 0 8px">{brand.category} · 담당 {brand.manager_name ?? '—'} · <a href={data.ordersPath}>주문 · 발주</a> · <a href={data.csPath}>고객 문의</a></p>
		<div class="btnrow"><a href={data.salesPath} class="btn ghost sm">실시간 매출</a><a href={data.settlePath} class="btn {brand.has_bank_info ? 'ghost' : 'pri'} sm">{brand.has_bank_info ? '정산' : '정산 정보 등록'}</a><a href={data.myPath} class="btn ghost sm">내 정보 · 등급</a></div>
	</div>
</div>
