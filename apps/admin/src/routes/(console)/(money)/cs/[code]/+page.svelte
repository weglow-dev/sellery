<script lang="ts">
	/**
	 * 문의 상세 (열람) — 브랜드 콘솔 `/cs/[code]` 와 같은 골격(머리 · 스레드 · 우측 주문/처리 카드) 에서 답글 폼과 [처리 종료] 를 뺀 것. customer 왼쪽 · brand 오른쪽 · admin 가운데.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { csSenderLabel } from '@sellery/db/cs/cs-rules';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const c = $derived(data.conversation);
	const p = $derived(c.campaign.product);
	const brandName = $derived(c.campaign.brand?.name ?? null);
	const who = (sender: 'customer' | 'brand' | 'admin') => (sender === 'customer' ? `${c.buyer_name} (고객)` : csSenderLabel(sender, brandName));
	const fmtTime = (iso: string) => `${md(iso)} ${iso.length >= 16 ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}`.trim();
</script>

<svelte:head>
	<title>문의 {c.code.toUpperCase()} — 셀러리 관리자</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 고객 문의</a>

<section class="card static console-det">
	{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={52} />{/if}
	<div class="grow">
		<div class="t">{p?.name ?? '문의'} <small>· {c.code.toUpperCase()}</small></div>
		<div class="meta">
			<span class="chip">{c.type}</span> · {c.buyer_name}{c.is_member ? ' (회원)' : ' (비회원)'} · 접수 {fmtTime(c.created_at)}
			{#if c.order_code}{' '}· 주문 <span class="console-mono">{c.order_code.toUpperCase()}</span>{#if !c.order}{' '}<span class="console-danger">(이 캠페인 주문에서 못 찾음)</span>{/if}{/if}
			· 캠페인 <a href={data.settleHref} class="console-mono">{c.campaign.code.toUpperCase()}</a>{#if c.campaign.seller}{' '}· {c.campaign.seller.handle}{/if}{#if brandName}{' '}· {brandName}{/if}
		</div>
	</div>
	<div><StatusChip tone={data.chip.tone}>{data.chip.label}</StatusChip></div>
</section>

<div class="console-det-body">
	<section class="card static console-thread cs-thread" aria-label="문의 스레드" id="thread">
		<div class="msgs">
			{#each data.messages as m (m.id)}
				<div class="msg {m.sender === 'customer' ? 'seller' : m.sender}">
					<div class="who">{who(m.sender)}</div>
					{m.body}
					<div class="tm">{fmtTime(m.created_at)}</div>
				</div>
			{:else}
				<div class="sysline">메시지가 없습니다</div>
			{/each}
			{#if c.status === 'CLOSED'}<div class="sysline">처리 종료 · {c.closed_at ? fmtTime(c.closed_at) : ''}</div>{/if}
		</div>
		<div class="composer">관리자는 열람만 해요 — 답변·처리 종료는 브랜드 콘솔에서 {brandName ?? '브랜드'}가 합니다.</div>
	</section>

	<div class="console-actions">
		{#if c.order}
			<div class="card static">
				<h4>주문 <span class="chip plat">매칭</span></h4>
				<dl class="console-kv">
					<dt>주문번호</dt><dd><a href={data.orderHref} class="console-mono">{c.order.code.toUpperCase()}</a></dd>
					<dt>상태</dt><dd>{c.order.status === 'PAID' ? (c.order.tracking_no ? '발송' : '미발송') : '환불·취소'}</dd>
					<dt>내역</dt><dd>{c.order.option_name || '기본'} × {c.order.qty} · ₩{fmtNum(c.order.amount)}</dd>
					{#if c.order.paid_at}<dt>결제</dt><dd>{md(c.order.paid_at)}</dd>{/if}
					{#if c.order.tracking_no}<dt>운송장</dt><dd>{c.order.courier ?? ''} {c.order.tracking_no}{#if data.orderTrackingUrl}{' '}<a href={data.orderTrackingUrl} target="_blank" rel="noopener">조회 ↗</a>{/if}</dd>{/if}
				</dl>
				<div class="btnrow" style="margin-top:8px"><a href={data.orderHref} class="btn ghost sm">주문 상세 · 환불</a></div>
			</div>
		{:else}
			<div class="card static">
				<h4>주문</h4>
				<p class="hint">{c.order_code ? `고객이 적은 주문번호 ${c.order_code.toUpperCase()} 는 이 캠페인 주문에서 찾지 못했어요.` : '고객이 주문번호를 남기지 않았어요.'}</p>
				<div class="btnrow"><a href={data.campaignOrdersHref} class="btn ghost sm">이 캠페인 주문 →</a></div>
			</div>
		{/if}

		<div class="card static">
			<h4>처리</h4>
			<dl class="console-kv">
				<dt>상태</dt><dd>{data.chip.label}</dd>
				<dt>브랜드</dt><dd>{brandName ?? '—'}</dd>
				<dt>접수</dt><dd>{fmtTime(c.created_at)}</dd>
				{#if c.replied_at}<dt>마지막 답변</dt><dd>{fmtTime(c.replied_at)}</dd>{/if}
				{#if c.closed_at}<dt>종료</dt><dd>{fmtTime(c.closed_at)}</dd>{/if}
			</dl>
			<p class="hint">결제·정산 문제는 <a href={data.settleHref}>정산 상세</a>에서, 환불은 주문 상세에서 처리해요.</p>
		</div>
	</div>
</div>
