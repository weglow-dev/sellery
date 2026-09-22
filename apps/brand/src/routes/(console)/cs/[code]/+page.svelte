<script lang="ts">
	/**
	 * 문의 상세 — 캠페인 상세(`/campaigns/[code]`)와 같은 골격: 머리(상품 · 유형 · 고객 · 상태 칩) · 스레드(customer 는 왼쪽 · brand 는 오른쪽 · admin 가운데) + 답글 폼(ThreadComposer `?/reply`) · 우측 카드(주문 요약 · 캠페인 · [처리 종료] `?/close`).
	 * CLOSED 는 폼 대신 "종료됨" 안내 — 고객도 추가 문의를 보낼 수 없어요(추가 문의는 새 접수).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { CS_BODY_MAX, csSenderLabel } from '@sellery/db/cs/cs-rules';
	import { ProductIcon, StatusChip, ThreadComposer } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.conversation);
	const p = $derived(c.campaign.product);
	const closed = $derived(c.status === 'CLOSED');
	const who = (sender: 'customer' | 'brand' | 'admin') => (sender === 'customer' ? `${c.buyer_name} (고객)` : csSenderLabel(sender, data.brand.name));
	const fmtTime = (iso: string) => `${md(iso)} ${iso.length >= 16 ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}`.trim();
</script>

<svelte:head>
	<title>문의 {c.code.toUpperCase()} — 셀러리 파트너</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 고객 문의</a>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<section class="card static console-det">
	{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={52} />{/if}
	<div class="grow">
		<div class="t">{p?.name ?? '문의'} <small>· {c.code.toUpperCase()}</small></div>
		<div class="meta">
			<span class="chip">{c.type}</span> · {c.buyer_name}{c.is_member ? ' (회원)' : ' (비회원)'} · 접수 {fmtTime(c.created_at)}
			{#if c.order_code}{' '}· 주문 <span class="console-mono">{c.order_code.toUpperCase()}</span>{#if !c.order}{' '}<span class="console-danger">(이 캠페인 주문에서 못 찾음)</span>{/if}{/if}
			· 캠페인 <a href={data.campaignHref} class="console-mono">{c.campaign.code.toUpperCase()}</a>{#if c.campaign.seller}{' '}· {c.campaign.seller.handle}{/if}
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
			{#if closed}<div class="sysline">처리 종료 · {c.closed_at ? fmtTime(c.closed_at) : ''}</div>{/if}
		</div>
		{#if closed}
			<div class="composer">종료된 문의예요 — 답변을 더 보낼 수 없어요. 고객이 추가 문의를 남기면 새 문의로 접수됩니다.</div>
		{:else}
			<ThreadComposer action="?/reply" as="브랜드" max={CS_BODY_MAX} value={form?.kind === 'reply' ? (form.values.body ?? '') : ''} error={form?.kind === 'reply' ? form.message : null} placeholder="고객에게 답변… (Enter 전송 · Shift+Enter 줄바꿈)" />
		{/if}
	</section>

	<div class="console-actions">
		{#if c.order}
			<div class="card static">
				<h4>주문 <span class="chip plat">매칭</span></h4>
				<dl class="console-kv">
					<dt>주문번호</dt><dd><span class="console-mono">{c.order.code.toUpperCase()}</span></dd>
					<dt>상태</dt><dd>{c.order.status === 'PAID' ? (c.order.tracking_no ? '발송' : '미발송') : '환불·취소'}</dd>
					<dt>내역</dt><dd>{c.order.option_name || '기본'} × {c.order.qty} · ₩{fmtNum(c.order.amount)}</dd>
					{#if c.order.paid_at}<dt>결제</dt><dd>{md(c.order.paid_at)}</dd>{/if}
					{#if c.order.tracking_no}<dt>운송장</dt><dd>{c.order.courier ?? ''} {c.order.tracking_no}{#if data.orderTrackingUrl}{' '}<a href={data.orderTrackingUrl} target="_blank" rel="noopener">조회 ↗</a>{/if}{#if c.order.shipped_at}<br /><span style="color:var(--color-mute)">발송 {md(c.order.shipped_at)}</span>{/if}</dd>{/if}
				</dl>
				<div class="btnrow" style="margin-top:8px"><a href={data.ordersHref} class="btn ghost sm">주문 표에서 보기</a></div>
			</div>
		{:else}
			<div class="card static">
				<h4>주문</h4>
				<p class="hint">{c.order_code ? `고객이 적은 주문번호 ${c.order_code.toUpperCase()} 는 이 캠페인 주문에서 찾지 못했어요 — 답변으로 주문번호를 확인해주세요.` : '고객이 주문번호를 남기지 않았어요 — 필요하면 답변으로 물어보세요.'}</p>
				<div class="btnrow"><a href={data.ordersHref} class="btn ghost sm">이 캠페인 주문 →</a></div>
			</div>
		{/if}

		<div class="card static">
			<h4>처리</h4>
			<dl class="console-kv">
				<dt>상태</dt><dd>{data.chip.label}</dd>
				<dt>접수</dt><dd>{fmtTime(c.created_at)}</dd>
				{#if c.replied_at}<dt>마지막 답변</dt><dd>{fmtTime(c.replied_at)}</dd>{/if}
				{#if c.closed_at}<dt>종료</dt><dd>{fmtTime(c.closed_at)}</dd>{/if}
			</dl>
			{#if !closed}
				<p class="hint">답변이 끝났으면 처리 종료로 표시하세요. 종료 후에는 양쪽 모두 이 스레드에 더 쓸 수 없어요.</p>
				<form method="post" action="?/close" onsubmit={(e) => { if (!confirm('이 문의를 처리 종료할까요? 고객도 더 이상 이 스레드에 쓸 수 없어요.')) e.preventDefault(); }}>
					<button type="submit" class="ghost sm">처리 종료</button>
				</form>
			{:else}
				<p class="hint">종료됨 ✓</p>
			{/if}
		</div>
	</div>
</div>
