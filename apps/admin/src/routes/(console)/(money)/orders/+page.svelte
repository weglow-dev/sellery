<script lang="ts">
	/**
	 * 전체 주문 — 프로토타입 vAdminOrders(칩 · 최근 60건 표 · [환불 처리]) 의 DB 판: 검색(`?q=`) + 필터 칩(`?f=`) + 표(주문 · 상품/옵션 · 판매(인플루언서 · 브랜드 · 캠페인) · 금액 · 배송 · 상태 · 결제키) → 행 [상세] `/orders/[code]`(환불은 상세에서).
	 * 375px: `.admin-table` 카드 모드.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const money = (n: number) => `₩${fmtNum(n)}`;
</script>

<svelte:head>
	<title>주문 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>주문</h2>
	{#if data.totals?.unshipped}<span class="badge">미발송 {data.totals.unshipped}</span>{/if}
	<span class="meta">전 브랜드 열람 · 환불은 상세에서 · 발송·CS 는 브랜드가</span>
	<a href={data.csPath} class="btn ghost sm" style="margin-left:auto">고객 문의 →</a>
</div>

{#if !data.loaded}
	<p class="notice danger" role="status">주문을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

<form method="get" action={data.self} class="console-form admin-search" role="search">
	{#if data.filter !== 'all'}<input type="hidden" name="f" value={data.filter} />{/if}
	<input name="q" value={data.q ?? ''} maxlength={80} placeholder="주문번호 · 구매자 · 캠페인 코드 · 상품 · 핸들 · 브랜드 · paymentKey" aria-label="주문 검색" />
	<button type="submit" class="pri sm">검색</button>
	{#if data.q}<a href={data.clearHref} class="btn ghost sm">지우기</a>{/if}
</form>

{#if data.totals}
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">결제 매출</span><span class="ms-v">{money(data.totals.paid_amount)}</span><span class="ms-s">결제완료 {data.totals.paid}건 · 환불 {money(data.totals.refund_amount)} 제외 전</span></div>
		<div><span class="ms-l">미발송</span><span class="ms-v" style={data.totals.unshipped ? 'color:var(--color-danger)' : ''}>{data.totals.unshipped}건</span><span class="ms-s">발송 {data.totals.shipped}건</span></div>
		<div><span class="ms-l">환불 · 취소</span><span class="ms-v">{data.totals.refunded}건</span><span class="ms-s">부분취소 {data.totals.partial}건</span></div>
		<div><span class="ms-l">결제키 없음</span><span class="ms-v" style={data.totals.manual ? 'color:var(--color-danger)' : ''}>{data.totals.manual}건</span><span class="ms-s">시드 · 수기 — 토스 환불 불가</span></div>
	</div>
{/if}

<nav class="cats console-filters" aria-label="주문 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {data.filter === f.key ? 'on' : ''}" aria-current={data.filter === f.key ? 'page' : undefined}>{f.label}{#if f.n !== null}{' '}<span class="n">{f.n}</span>{/if}</a>
	{/each}
</nav>

<div class="tblw admin-table admin-orders">
	<table>
		<thead>
			<tr><th>주문</th><th>상품 · 옵션</th><th>판매</th><th class="num">금액</th><th>배송</th><th>상태</th><th>결제</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.rows as o (o.id)}
				<tr class={o.state === 'unshipped' ? 'row-due' : o.state === 'refunded' ? 'row-muted' : ''}>
					<td data-l="주문"><a href={o.href} class="console-mono"><b>{o.code.toUpperCase()}</b></a><small>{md(o.paid_at)} · {o.buyer_name}{o.buyer_email ? ` · ${o.buyer_email}` : ''}</small></td>
					<td data-l="상품 · 옵션">
						<span class="console-cell-prod">
							{#if o.campaign.product}<ProductIcon thumbUrl={o.campaign.product.thumb_url} emoji={o.campaign.product.emoji} size={22} />{/if}
							<span><b>{o.campaign.product?.name ?? '—'}</b><small>{o.option_name ? `${o.option_name} · ` : ''}{o.qty}개{o.is_sample ? ' · 샘플 구매' : ''}</small></span>
						</span>
					</td>
					<td data-l="판매">{o.campaign.seller?.name ?? '—'}<small>{o.brand?.name ?? ''} · <span class="console-mono">{o.campaign.code.toUpperCase()}</span></small></td>
					<td class="num" data-l="금액"><b>{money(o.amount)}</b>{#if o.refund_amount}<small>환불 −{money(o.refund_amount)}</small>{/if}</td>
					<td data-l="배송">{#if o.state === 'shipped'}<StatusChip tone="blue">발송</StatusChip><small>{o.courier ?? ''} {o.tracking_no ?? ''}</small>{:else if o.state === 'unshipped'}<StatusChip tone="amber">미발송</StatusChip>{:else}<span class="meta">—</span>{/if}</td>
					<td data-l="상태">{#if o.status === 'PAID'}<StatusChip tone="green">결제완료</StatusChip>{#if o.refund_amount}<small class="console-danger">부분취소</small>{/if}{:else}<StatusChip tone="gray">{o.status === 'CANCELED' ? '취소' : '환불'}</StatusChip>{#if o.refund_actor}<small>{o.refund_actor === 'brand' ? '브랜드' : o.refund_actor === 'customer' ? '고객 신청' : '운영팀'}</small>{/if}{/if}</td>
					<td data-l="결제">{#if o.has_payment_key}<span class="chip plat">토스</span>{:else}<span class="chip auto" title="토스 결제 키 없음 — 시드·수기">키 없음</span>{/if}{#if o.payment_method}<small>{o.payment_method}</small>{/if}</td>
					<td data-l="" class="admin-row-act"><a href={o.href} class="btn ghost sm">상세</a></td>
				</tr>
			{:else}
				<tr><td colspan="8" class="empty">{data.q || data.filter !== 'all' ? '조건에 맞는 주문이 없어요' : '주문이 없습니다'}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
{#if data.rows.length >= 200}<p class="meta" style="margin:6px 4px">최근 200건까지 표시돼요 — 검색이나 필터로 좁혀주세요.</p>{/if}
