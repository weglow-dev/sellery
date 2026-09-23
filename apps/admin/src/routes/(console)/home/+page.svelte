<script lang="ts">
	/**
	 * 관리자 홈 = 대시보드 — 데모 `(demo)/demo`(`vAdminHome`) 와 같은 구성.
	 * 히어로 띠 · KPI 4장 · 오늘 할 일 · 최근 활동 · 전체 캠페인 표.
	 * 숫자는 +page.server.ts(`getAdminDashboard` · `getPaymentsHealth` · `listRecentActivity`).
	 * 데모 [데이터 초기화] 는 옮기지 않는다(실서비스 운영 데이터를 지우면 안 됨).
	 */
	import { campaignPeriodLabel, campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const money = (n: number) => `₩${fmtNum(n)}`;
	const homePath = $derived(page.url.pathname);
	const statusHref = (status: string | null) => {
		const p = new URLSearchParams();
		if (status) p.set('status', status);
		const qs = p.toString();
		return qs ? `${homePath}?${qs}` : homePath;
	};
	/** 캠페인 상세 — 데모가 행 클릭 시 열던 화면(스레드 · 브랜드 대행 액션 · 정산 미리보기) */
	const campaignHref = (code: string | null) =>
		code ? `${data.paths.campaigns}/${encodeURIComponent(code)}` : data.paths.products;
	const productHref = (code: string | null) =>
		code ? `${data.paths.products}/${encodeURIComponent(code)}` : data.paths.products;
	const sellerHref = (code: string | null) =>
		code ? `${data.paths.sellers}/${encodeURIComponent(code)}` : data.paths.sellers;

	function rowClick(href: string) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			goto(href);
		};
	}
	function rowKey(href: string) {
		return (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			e.preventDefault();
			goto(href);
		};
	}

	const todo = $derived([
		{
			n: data.todo.pendingProducts,
			label: '상품 검수 대기',
			href: `${data.paths.products}?status=pending`
		},
		{
			n: data.money?.dueNow ?? 0,
			label: '정산 실행 가능',
			href: data.paths.settle
		},
		{
			n: data.todo.exclusivePending,
			label: '독점권 신청 대기',
			href: data.paths.products
		},
		{
			n: data.todo.unshippedOrders,
			label: '미발송 주문',
			href: data.paths.orders
		},
		{
			n: data.todo.channelsAwaitingApproval,
			label: '채널 인증 대기',
			href: `${data.paths.sellers}?filter=pending_channel`
		},
		{
			n: data.todo.noSettleInfoAccounts,
			label: '정산정보 미등록 계정',
			href: `${data.paths.brands}?filter=no_settle_info`
		}
	]);
</script>

<svelte:head>
	<title>관리자 홈 — 셀러리</title>
</svelte:head>

<div class="hero-band">
	<div class="ey">Sellery Operations</div>
	<h1>셀러리 전체 <em>거래 현황</em>을 한눈에.</h1>
	<div class="sub">
		캠페인 <b>{fmtNum(data.totals.campaigns)}건</b>
		· 주문 <b>{fmtNum(data.totals.orders)}건</b>
		· 상품 <b>{fmtNum(data.totals.products)}개</b>
		· 인플루언서 <b>{fmtNum(data.totals.sellers)}명</b>
		· 브랜드 <b>{fmtNum(data.totals.brands)}개</b>
		{#if data.email}<span class="home-ops"> · {data.email}</span>{/if}
	</div>
</div>

<div class="grid g4 home-kpi-grid">
	<a href={data.paths.settle} class="card kpi go home-kpi">
		<div class="lbl">누적 GMV (확정)</div>
		<div class="val">{money(data.kpi.gmv)}</div>
		{#if data.kpi.noSnapshot}
			<div class="sub">스냅샷 없는 건 {data.kpi.noSnapshot} — 합계에서 제외</div>
		{/if}
	</a>
	<a href={data.paths.settle} class="card kpi go home-kpi">
		<div class="lbl">플랫폼 순수익 (VAT 제외)</div>
		<div class="val home-kpi-accent">{money(data.kpi.platformNet)}</div>
		<div class="sub">순 테이크레이트 {data.kpi.takeRate !== null ? data.kpi.takeRate.toFixed(2) : '0.00'}%</div>
	</a>
	<a href={statusHref('LIVE')} class="card kpi go home-kpi">
		<div class="lbl">진행 중 판매</div>
		<div class="val">{data.kpi.live}건</div>
		<div class="sub">오늘 주문 {fmtNum(data.kpi.ordersToday)}건</div>
	</a>
	<a href={data.paths.orders} class="card kpi go home-kpi">
		<div class="lbl">환불률</div>
		<div class="val">{data.kpi.refundRate.toFixed(1)}%</div>
		<div class="sub">주문 {fmtNum(data.kpi.ordersTotal)}건 기준</div>
	</a>
</div>

<div class="grid g2 home-mid">
	<section class="card static home-todo">
		<div class="lbl-sm">오늘 할 일</div>
		{#each todo as t (t.label)}
			<a href={t.href} class="rowitem home-todo-row">
				<div class="grow"><div class="nm">{t.label}</div></div>
				<StatusChip tone={t.n ? 'amber' : 'gray'}>{t.n}건</StatusChip>
			</a>
		{/each}
	</section>

	<section class="card static flat home-feed">
		<div class="lbl-sm home-feed-hd">최근 활동</div>
		{#each data.activity as x (x.id)}
			<a
				href={x.campaign_code ? campaignHref(x.campaign_code) : productHref(x.product_code)}
				class="home-news-item"
			>
				<span class="home-nb">{md(x.created_at)}</span>
				<div>
					<b>{x.product_name ?? x.campaign_code ?? '캠페인'}</b>
					· {x.body}
				</div>
			</a>
		{:else}
			<div class="empty home-feed-empty">활동 없음</div>
		{/each}
	</section>
</div>

<div class="sec">
	전체 캠페인
	{#if data.campaigns.length}<span class="badge">{data.campaigns.length}</span>{/if}
</div>

<nav class="cats console-filters" aria-label="캠페인 상태 필터">
	<a
		href={statusHref(null)}
		class="catchip {!data.statusFilter ? 'on' : ''}"
		aria-current={!data.statusFilter ? 'page' : undefined}
	>
		전체<span class="n"> {data.totals.campaigns}</span>
	</a>
	{#each data.statusCounts as c (c.status)}
		<a
			href={statusHref(c.status)}
			class="catchip {data.statusFilter === c.status ? 'on' : ''}"
			aria-current={data.statusFilter === c.status ? 'page' : undefined}
		>
			{c.label}<span class="n"> {c.n}</span>
		</a>
	{/each}
</nav>

<div class="tblw admin-table home-camps">
	<table>
		<thead>
			<tr>
				<th>캠페인</th>
				<th>인플루언서</th>
				<th>브랜드</th>
				<th class="num">기간</th>
				<th class="num">주문</th>
				<th class="num">확정 매출</th>
				<th class="num">플랫폼 순수익</th>
				<th>상태</th>
			</tr>
		</thead>
		<tbody>
			{#each data.campaigns as c (c.id)}
				{@const chip = campaignStatusChip(c.status)}
				{@const href = campaignHref(c.code)}
				<tr
					class="clickable"
					onclick={rowClick(href)}
					onkeydown={rowKey(href)}
					tabindex="0"
					role="link"
					aria-label="{c.product_name ?? c.code ?? '캠페인'} 캠페인 상세"
				>
					<td class="nm" data-l="캠페인">
						<span class="home-camp-cell">
							<ProductIcon emoji={c.product_emoji ?? '📦'} thumbUrl={c.product_thumb_url} size={22} />
							<span>
								<a href={href}><b>{c.product_name ?? '—'}</b></a>
								<span class="home-camp-meta">
									{#if c.code}<span class="console-mono">{c.code}</span>{/if}
									{#if c.auto} · 자동{/if}
									{#if c.invited && !c.auto} · 브랜드 제안{/if}
								</span>
							</span>
						</span>
					</td>
					<td data-l="인플루언서">
						{#if c.seller_platform && c.seller_handle}
							{#if c.seller_code}
								<a href={sellerHref(c.seller_code)}
									><PlatformHandle platform={c.seller_platform} handle={c.seller_handle} /></a
								>
							{:else}
								<PlatformHandle platform={c.seller_platform} handle={c.seller_handle} />
							{/if}
						{:else if c.seller_code}
							<a href={sellerHref(c.seller_code)}>{c.seller_name ?? c.seller_handle ?? '—'}</a>
						{:else}
							{c.seller_name ?? c.seller_handle ?? '—'}
						{/if}
					</td>
					<td data-l="브랜드">
						{#if c.brand_code}
							<a href="{data.paths.brands}/{encodeURIComponent(c.brand_code)}">{c.brand_name ?? '—'}</a>
						{:else}
							{c.brand_name ?? '—'}
						{/if}
					</td>
					<td class="num" data-l="기간">{campaignPeriodLabel(c.start_date, c.end_date)}</td>
					<td class="num" data-l="주문">
						{c.paid_count}{#if c.refund_count}
							<span class="home-ref"> −{c.refund_count}</span>{/if}
					</td>
					<td class="num" data-l="확정 매출">
						{#if c.amountUnknown}<span class="meta">—</span>{:else}{money(c.net)}{/if}
					</td>
					<td class="num" data-l="플랫폼 순수익">
						{#if c.amountUnknown}<span class="meta">—</span>{:else}{money(c.platform_net)}{/if}
					</td>
					<td data-l="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></td>
				</tr>
			{:else}
				<tr>
					<td colspan="8" class="empty">해당 상태의 캠페인이 없습니다</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.home-ops {
		color: var(--color-mute);
	}
	.home-kpi-grid {
		margin: 0 0 4px;
	}
	.home-kpi {
		text-decoration: none;
		color: inherit;
		display: block;
		cursor: pointer;
	}
	.home-kpi .lbl {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-mute);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 700;
	}
	.home-kpi .val {
		font-family: var(--font-display);
		font-size: 29px;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin-top: 6px;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.home-kpi-accent {
		color: var(--color-accent);
	}
	.home-kpi .sub {
		font-size: 11.5px;
		color: var(--color-mute);
		margin-top: 3px;
	}
	.home-kpi:hover .lbl::after {
		content: ' →';
		color: var(--color-accent);
	}
	.home-mid {
		margin-top: 18px;
	}
	.home-todo .lbl-sm {
		margin-bottom: 10px;
	}
	.home-todo-row {
		padding: 8px 4px;
		text-decoration: none;
		color: inherit;
	}
	.home-todo-row .nm {
		font-size: 13px;
	}
	.home-feed {
		padding: 0;
		overflow: hidden;
	}
	.home-feed-hd {
		padding: 16px 18px 6px;
	}
	.home-news-item {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 11px 18px;
		border-top: 1px solid var(--color-soft-line);
		cursor: pointer;
		font-size: 13px;
		line-height: 1.55;
		text-decoration: none;
		color: inherit;
		word-break: keep-all;
	}
	.home-news-item:hover {
		background: color-mix(in srgb, var(--color-lime) 14%, transparent);
	}
	.home-news-item b {
		color: var(--color-ink);
	}
	.home-nb {
		flex: 0 0 auto;
		min-width: 52px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 2px 8px;
		background: var(--color-lime);
		box-shadow: var(--shadow-frame-soft);
		color: var(--color-ink);
	}
	.home-feed-empty {
		padding: 24px 18px;
	}
	.home-camps {
		margin-top: 4px;
	}
	.home-camp-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.home-camp-meta {
		display: block;
		font-size: 11px;
		color: var(--color-mute);
	}
	.home-ref {
		color: var(--color-danger);
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover td {
		background: color-mix(in srgb, var(--color-lime) 12%, transparent);
	}
	@media (max-width: 900px) {
		.home-kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.home-kpi .val {
			font-size: 22px;
		}
	}
	@media (max-width: 560px) {
		.home-mid {
			grid-template-columns: 1fr;
		}
		.home-kpi-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
