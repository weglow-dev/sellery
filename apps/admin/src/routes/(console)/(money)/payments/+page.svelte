<script lang="ts">
	/**
	 * 결제 정합성 — 운영 큐(0 이 아닌 항목)를 위에 빨간 카드로, 아래는 영역별 카운트(체크아웃 세션 · 결제 이벤트 · 샘플 결제 · 주문 · 정산) 와 마지막 reconcile. 버튼 없음(크론은 shop · CRON_SECRET).
	 */
	import { md } from '@sellery/db/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const h = $derived(data.health);
	const fmtTime = (iso: string | null) => (iso ? `${md(iso)} ${iso.length >= 16 ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}`.trim() : '—');
</script>

<svelte:head>
	<title>결제 정합성 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>결제 정합성</h2>
	{#if data.issues.length}<span class="badge">{data.issues.length}</span>{/if}
	<span class="meta">토스 ↔ 주문 ↔ 정산이 어긋난 곳 · 처리는 각자의 자리에서</span>
	<a href={data.ordersPath} class="btn ghost sm" style="margin-left:auto">주문 →</a>
</div>

{#if !h}
	<p class="notice danger" role="status">정합성 데이터를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else}
	<p class="meta" style="margin:-8px 3px 14px">기준 {fmtTime(h.now)} · 마지막 reconcile {fmtTime(h.reconcile.last_at)}{h.reconcile.last_result ? ` (${h.reconcile.last_result})` : ''} — 크론 10분 · 수동은 <code class="admin-code">POST /api/cron/reconcile</code> + CRON_SECRET (docs/deploy.md §8.2)</p>

	<div class="sec">운영 큐 {#if !data.issues.length}<span class="console-sec-sub">— 비어 있어요 ✓</span>{/if}</div>
	<div class="admin-health">
		{#each data.issues as i (i.key)}
			<a href={i.href} class="card static admin-issue">
				<div class="lbl-sm">{i.label}</div>
				<div class="val">{i.count}<small>건</small></div>
				{#if i.how}<div class="how">{i.how}</div>{/if}
			</a>
		{:else}
			<div class="card static admin-issue ok"><div class="lbl-sm">운영 큐</div><div class="val">0<small>건</small></div><div class="how">고착 세션 · 미처리 이벤트 · 조정 큐 · 정산 도래 · 지급 보류가 모두 0 이에요.</div></div>
		{/each}
	</div>

	<div class="sec" style="margin-top:20px">체크아웃 세션</div>
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">PENDING</span><span class="ms-v">{h.checkout_sessions.pending}</span><span class="ms-s">결제창 진입 · 미승인</span></div>
		<div><span class="ms-l">CONFIRMING</span><span class="ms-v" style={h.checkout_sessions.stale_confirming ? 'color:var(--color-danger)' : ''}>{h.checkout_sessions.confirming}</span><span class="ms-s">2분 초과 {h.checkout_sessions.stale_confirming}</span></div>
		<div><span class="ms-l">만료 대상</span><span class="ms-v">{h.checkout_sessions.expired_due}</span><span class="ms-s">expire_checkout_sessions()</span></div>
		<div><span class="ms-l">취소 재시도 대기</span><span class="ms-v" style={h.checkout_sessions.cancel_pending ? 'color:var(--color-danger)' : ''}>{h.checkout_sessions.cancel_pending}</span><span class="ms-s">24h 승인 {h.checkout_sessions.confirmed_24h}</span></div>
	</div>

	<div class="sec">결제 이벤트 · 샘플 결제</div>
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">미처리 이벤트</span><span class="ms-v" style={h.payment_events.unhandled ? 'color:var(--color-danger)' : ''}>{h.payment_events.unhandled}</span><span class="ms-s">{h.payment_events.unhandled_oldest ? `가장 오래된 ${md(h.payment_events.unhandled_oldest)}` : '없음'}</span></div>
		<div><span class="ms-l">7일 오류</span><span class="ms-v">{h.payment_events.errors_7d}</span><span class="ms-s">마지막 수신 {h.payment_events.last_received_at ? md(h.payment_events.last_received_at) : '—'}</span></div>
		<div><span class="ms-l">샘플 결제 대기</span><span class="ms-v">{h.partner_payments.pending}</span><span class="ms-s">확인 중 {h.partner_payments.confirming}</span></div>
		<div><span class="ms-l">샘플 취소 실패</span><span class="ms-v" style={h.partner_payments.cancel_pending ? 'color:var(--color-danger)' : ''}>{h.partner_payments.cancel_pending}</span><span class="ms-s">환불됨 {h.partner_payments.refunded}</span></div>
	</div>

	<div class="sec">주문</div>
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">결제완료</span><span class="ms-v">{h.orders.paid}</span><span class="ms-s"><a href={data.ordersPath}>주문 표</a></span></div>
		<div><span class="ms-l">결제키 없음</span><span class="ms-v" style={h.orders.paid_without_key ? 'color:var(--color-danger)' : ''}>{h.orders.paid_without_key}</span><span class="ms-s"><a href="{data.ordersPath}?f=manual">시드 · 수기</a></span></div>
		<div><span class="ms-l">부분취소</span><span class="ms-v" style={h.orders.partial_refund ? 'color:var(--color-danger)' : ''}>{h.orders.partial_refund}</span><span class="ms-s"><a href="{data.ordersPath}?f=partial">정산 수동 확인</a></span></div>
		<div><span class="ms-l">정산 후 환불</span><span class="ms-v" style={h.orders.refund_needs_adjust ? 'color:var(--color-danger)' : ''}>{h.orders.refund_needs_adjust}</span><span class="ms-s">조정 큐 · 발송 후 환불 {h.orders.refund_after_ship} · 취소 조정 {h.orders.canceled_adjust}</span></div>
	</div>

	<div class="sec">정산 · 지급</div>
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">기준일 도래</span><span class="ms-v" style={h.settlements.due_now ? 'color:var(--color-danger)' : ''}>{h.settlements.due_now}</span><span class="ms-s"><a href={data.settlePath}>정산 실행</a></span></div>
		<div><span class="ms-l">정산 명세</span><span class="ms-v">{h.settlements.pending + h.settlements.held + h.settlements.paid}</span><span class="ms-s">대기 {h.settlements.pending} · 보류 {h.settlements.held} · 완료 {h.settlements.paid}</span></div>
		<div><span class="ms-l">지급 대기</span><span class="ms-v">{h.settlements.payouts_pending}</span><span class="ms-s"><a href={data.payoutsPath}>지급 관리</a></span></div>
		<div><span class="ms-l">지급 보류</span><span class="ms-v" style={h.settlements.payouts_held ? 'color:var(--color-danger)' : ''}>{h.settlements.payouts_held}</span><span class="ms-s"><a href="{data.payoutsPath}?status=held">보류 목록</a></span></div>
	</div>
{/if}
