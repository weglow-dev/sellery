<script lang="ts">
	/**
	 * 주문 상세 — 머리(상품 · 주문번호 · 상태) · 주문 kv(구매자 · 수취인 원문(발송 목적) · 금액 · 결제수단 · 운송장) · 결제 세션 kv(토스 orderId · paymentKey · 승인 · 실패) · 결제 이벤트 · 캠페인 이벤트 · 문의 ·
	 * 우측 [환불](사유 셀렉트 + 메모 · confirm · 정산 완료면 "정산 조정으로 기록" 안내 · 결제키 없으면 버튼 대신 안내).
	 */
	import { trackingUrlOf } from '@sellery/db/carriers';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const o = $derived(data.order);
	const p = $derived(o.campaign.product);
	const money = (n: number | null) => (n === null ? '—' : `₩${fmtNum(n)}`);
	const fmtTime = (iso: string | null) => (iso ? `${md(iso)} ${iso.length >= 16 ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}`.trim() : '—');
	const trackingUrl = $derived(trackingUrlOf(o.courier, o.tracking_no));
	const addr = $derived(o.shipping ? `(${o.shipping.postcode}) ${o.shipping.address1}${o.shipping.address2 ? ` ${o.shipping.address2}` : ''}` : null);
	const confirmRefund = (e: SubmitEvent) => {
		const tail = data.settled ? '\n정산이 끝난 판매입니다 — 주문은 취소로 기록되고 정산 조정 큐에 남습니다(스냅샷 불변).' : '';
		if (!confirm(`${o.code.toUpperCase()} · ${money(o.amount)} 를 전액 환불할까요? 토스 결제가 즉시 취소되며 되돌릴 수 없어요.${tail}`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>주문 {o.code.toUpperCase()} — 셀러리 관리자</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 주문</a>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<section class="card static console-det">
	{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={52} />{/if}
	<div class="grow">
		<div class="t">{p?.name ?? '주문'} <small>· {o.code.toUpperCase()}</small></div>
		<div class="meta">
			{o.option_name || '기본'} × {o.qty} · {o.campaign.seller?.name ?? '—'}{o.campaign.seller?.handle ? ` ${o.campaign.seller.handle}` : ''} · {o.brand?.name ?? '—'}
			· 캠페인 <a href={data.settleHref} class="console-mono">{o.campaign.code.toUpperCase()}</a> ({o.campaign.status}) · <a href={data.campaignOrdersHref}>같은 캠페인 주문</a>
			{#if o.is_sample}{' '}· <span class="chip seller">샘플 구매</span>{/if}
		</div>
	</div>
	<div class="admin-det-status">
		{#if o.status === 'PAID'}<StatusChip tone="green">결제완료</StatusChip>{:else}<StatusChip tone="gray">{o.status === 'CANCELED' ? '취소' : '환불'}</StatusChip>{/if}
		{#if data.state === 'shipped'}<StatusChip tone="blue">발송</StatusChip>{:else if data.state === 'unshipped'}<StatusChip tone="amber">미발송</StatusChip>{/if}
	</div>
</section>

<div class="console-det-body admin-det-body">
	<div>
		<section class="card static">
			<h4 class="admin-h4">주문</h4>
			<dl class="console-kv">
				<dt>구매자</dt><dd>{o.buyer_name}{o.buyer_email ? ` · ${o.buyer_email}` : ''}{o.buyer_phone ? ` · ${o.buyer_phone}` : ''}{o.user_id ? '' : ' · 비회원'}</dd>
				<dt>수취인</dt><dd>{#if o.shipping}{o.shipping.recipient} · {o.shipping.phone}<br />{addr}{#if o.shipping.memo}<br /><span class="meta">요청: {o.shipping.memo}</span>{/if}{:else}<span class="meta">없음 (시드 주문)</span>{/if}</dd>
				<dt>금액</dt><dd><b>{money(o.amount)}</b> <span class="meta">= {money(o.unit_price)} × {o.qty}</span>{#if o.refund_amount}<br /><span class="console-danger">환불 −{money(o.refund_amount)}{o.refunded_at ? ` · ${fmtTime(o.refunded_at)}` : ''}{o.refund_actor ? ` · ${o.refund_actor === 'brand' ? '브랜드' : o.refund_actor === 'customer' ? '고객 신청' : '운영팀'}` : ''}{o.refund_reason ? ` · ${o.refund_reason}` : ''}</span>{/if}</dd>
				<dt>결제</dt><dd>{fmtTime(o.paid_at)}{o.payment_method ? ` · ${o.payment_method}` : ''}{#if o.payment_status}{' '}· <span class="console-mono">{o.payment_status}</span>{/if}</dd>
				<dt>운송장</dt><dd>{#if o.tracking_no}{o.courier ?? ''} <span class="console-mono">{o.tracking_no}</span>{#if trackingUrl}{' '}<a href={trackingUrl} target="_blank" rel="noopener">조회 ↗</a>{/if}{#if o.shipped_at}<br /><span class="meta">발송 {fmtTime(o.shipped_at)}</span>{/if}{:else}<span class="meta">미등록</span>{/if}</dd>
				<dt>생성</dt><dd>{fmtTime(o.created_at)}</dd>
			</dl>
		</section>

		<section class="card static">
			<h4 class="admin-h4">결제 (토스)</h4>
			<dl class="console-kv">
				<dt>paymentKey</dt><dd>{#if o.payment_key}<code class="admin-code">{o.payment_key}</code>{:else}<span class="meta">없음 — 시드·수기 주문 (토스 환불 불가)</span>{/if}</dd>
				{#if data.session}
					<dt>세션</dt><dd><span class="console-mono">{data.session.status ?? '—'}</span> · {money(data.session.amount)} · <span class="meta">{data.session.id}</span></dd>
					<dt>orderId</dt><dd><code class="admin-code">{data.session.toss_order_id ?? '—'}</code></dd>
					<dt>승인</dt><dd>{fmtTime(data.session.approved_at)}{data.session.payment_method ? ` · ${data.session.payment_method}` : ''}</dd>
					{#if data.session.fail_code}<dt>실패</dt><dd class="console-danger">{data.session.fail_code} {data.session.fail_message ?? ''}</dd>{/if}
					<dt>만료 · 생성</dt><dd>{fmtTime(data.session.expires_at)} · {fmtTime(data.session.created_at)}</dd>
				{:else}
					<dt>세션</dt><dd><span class="meta">체크아웃 세션 없음</span></dd>
				{/if}
			</dl>
		</section>

		<div class="sec">결제 이벤트 <span class="console-sec-sub">— payment_events (최근 20)</span></div>
		<div class="listcard admin-events">
			{#each data.paymentEvents as e (e.id)}
				<div class="rowitem">
					<span class="chip {e.handled ? 'plat' : 'auto'}">{e.source ?? '—'}{e.event_type ? ` · ${e.event_type}` : ''}</span>
					<div class="grow"><div class="sub">{e.result ?? '—'}{#if !e.handled}{' '}<span class="console-danger">(미처리)</span>{/if}</div></div>
					<span class="console-mono meta">{fmtTime(e.received_at)}</span>
				</div>
			{:else}
				<div class="empty" style="padding:18px">결제 이벤트 없음</div>
			{/each}
		</div>

		<div class="sec">캠페인 이벤트 <span class="console-sec-sub">— 이 주문이 남긴 기록</span></div>
		<div class="listcard admin-events">
			{#each data.campaignEvents as e (e.id)}
				<div class="rowitem">
					<span class="chip plat">{e.event_type ?? '—'}</span>
					<div class="grow"><div class="sub">{e.body}</div></div>
					<span class="console-mono meta">{fmtTime(e.created_at)}</span>
				</div>
			{:else}
				<div class="empty" style="padding:18px">이벤트 없음</div>
			{/each}
		</div>
	</div>

	<div class="console-actions">
		<div class="card static">
			<h4>환불</h4>
			{#if !data.refund.possible}
				<p class="hint">{o.is_sample ? '인플루언서 샘플 구매 주문은 여기서 환불하지 않아요 — 샘플 결제 흐름(refund-sample)으로.' : '이미 환불·취소된 주문이에요.'}</p>
			{:else if !data.refund.hasKey}
				<p class="hint"><b>토스 결제 키가 없는 주문</b>(시드 · 수기)이라 콘솔에서 환불할 수 없어요. 밖에서 돈을 돌려줬다면 운영 스크립트의 '기록만'(recordOnly)으로 남기세요.</p>
			{:else}
				{#if data.settled}
					<p class="notice" style="margin:0 0 10px"><b>정산 완료 판매</b>의 주문이에요 — 환불하면 토스 취소 뒤 주문을 취소로 기록하고 <b>정산 조정 큐</b>(refund_needs_adjust)에 남깁니다. 정산 스냅샷은 바뀌지 않아요.</p>
				{:else if data.state === 'shipped'}
					<p class="hint">이미 발송된 주문이에요 — 회수는 브랜드 CS 로. 관리자 환불은 발송 후에도 가능합니다(전액).</p>
				{:else}
					<p class="hint">전액 환불만 가능해요. 토스 결제가 즉시 취소되고 고객에게 안내됩니다.</p>
				{/if}
				<form method="post" action="?/refund" class="console-form" onsubmit={confirmRefund}>
					<div class="fld">
						<label for="rf-reason">사유</label>
						<select id="rf-reason" name="reason" required>
							{#each data.refund.reasons as r (r)}<option value={r}>{r}</option>{/each}
						</select>
					</div>
					<div class="fld">
						<label for="rf-memo">메모 <span class="font-normal">(선택 · 토스 취소 사유에 함께)</span></label>
						<textarea id="rf-memo" name="reason_text" rows="2" maxlength={data.refund.max}></textarea>
					</div>
					<div class="btnrow"><button type="submit" class="danger sm">{data.settled ? '환불 + 정산 조정으로 기록' : '전액 환불 확정'}</button></div>
				</form>
			{/if}
		</div>

		<div class="card static">
			<h4>문의</h4>
			{#each data.cs as c (c.code)}
				<div class="rowitem" style="padding:6px 0">
					<div class="grow"><a href={c.href} class="console-mono">{c.code.toUpperCase()}</a> · {c.type} · {c.buyer_name}<div class="sub">{md(c.last_message_at)}</div></div>
					<StatusChip tone={c.chip.tone}>{c.chip.label}</StatusChip>
				</div>
			{:else}
				<p class="hint">이 주문의 문의가 없어요.</p>
			{/each}
		</div>
	</div>
</div>
