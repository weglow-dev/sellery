<script lang="ts">
	/**
	 * 샘플 결제 화면 — 요약(상품 · 금액 🥬/현금 분할) + 토스 위젯(PayClient) 또는 종결 상태 안내 (docs/inf-console-plan.md §6 `/pay/[id]`).
	 *   payable(PENDING · 만료 전) → 요약 카드 + [취소](?/cancel) + PayClient(결제 수단 · 약관 · [₩N 결제하기])
	 *   CONFIRMING → "확인 중" (새로고침 · 캠페인 목록) · CONFIRMED → 캠페인 링크 · FAILED/CANCELED/EXPIRED → 문구 + [다시 시도](/pay/new?product=) · REFUNDED → 안내
	 * 취소 규정 문구(SAMPLE_PAY_CANCEL_NOTICE)는 위젯 아래 — 계획서 §7 4단계 "결제 화면 취소 규정 문구".
	 */
	import { SAMPLE_PAY_CANCEL_NOTICE, SAMPLE_PAY_CEL_NOTICE } from '@sellery/db/partner/sample-rules';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import PayClient from './PayClient.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const pay = $derived(data.payment);
	const pr = $derived(data.product);
	const expiresText = $derived.by(() => {
		const t = Date.parse(pay.expires_at);
		if (!Number.isFinite(t)) return '';
		const d = new Date(t);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	});
</script>

<svelte:head>
	<title>{data.payable ? '샘플 결제' : data.chip.label} — 셀러리 파트너</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<a href={data.paths.product} class="btn ghost sm" style="margin:0 3px 12px">← 상품 상세</a>

<section class="card static console-det">
	{#if pr}<ProductIcon thumbUrl={pr.thumb_url} emoji={pr.emoji} size={52} />{/if}
	<div class="grow">
		<div class="t">{pay.order_name || '샘플 구매'} <small>{pay.toss_order_id}</small></div>
		<div class="meta">
			{#if pr}<span class="chip brand">{pr.brand ?? '—'}</span>{' '}{/if}
			결제 금액 <b>{data.amountText}</b>
		</div>
		<dl class="console-kv" style="margin-top:10px">
			<dt>🥬 사용</dt>
			<dd>{pay.amount_cel > 0 ? `🥬 ${pay.amount_cel} (₩${(pay.amount_cel * pay.cel_won).toLocaleString('ko-KR')} 상당)` : '—'}</dd>
			<dt>현금 결제</dt>
			<dd><b>₩{pay.amount_cash.toLocaleString('ko-KR')}</b></dd>
			{#if data.payable && expiresText}<dt>결제 기한</dt><dd>오늘 {expiresText} 까지 · 지나면 다시 시작해야 해요</dd>{/if}
		</dl>
	</div>
	<div><StatusChip tone={data.chip.tone}>{data.chip.label}</StatusChip></div>
</section>

{#if data.payable}
	<div class="sec" style="margin-top:20px">결제</div>
	<PayClient
		amount={pay.amount_cash}
		orderId={pay.toss_order_id}
		orderName={pay.order_name || '샘플 구매'}
		customerKey={data.customer.key}
		customerName={data.customer.name}
		customerEmail={data.customer.email}
		successPath={data.paths.success}
		failPath={data.paths.fail}
	/>
	<section class="card static">
		<p class="meta" style="margin:0">
			{SAMPLE_PAY_CANCEL_NOTICE}.{#if pay.amount_cel > 0}{' '}{SAMPLE_PAY_CEL_NOTICE}.{/if}{#if pr?.refund}{' '}<b>이 상품은 판매 확정 시 샘플 구매액을 환급합니다.</b>{/if}
		</p>
		<form method="post" action="?/cancel" class="btnrow" style="justify-content:flex-end;margin-top:10px">
			<button type="submit" class="ghost sm">결제 그만두기</button>
		</form>
	</section>
{:else if pay.status === 'CONFIRMING'}
	<section class="card static">
		<h4 style="margin:0 0 8px">결제 확인 중 ⏳</h4>
		<div class="notice" role="status" style="margin:0 0 10px">결제를 확인하고 있어요 — 잠시 후 이 화면을 새로고침하거나 캠페인 목록에서 확인해주세요. 승인되지 않은 결제는 자동으로 정리됩니다.</div>
		<div class="btnrow" style="justify-content:flex-end">
			<a href={data.paths.campaigns} class="btn">내 캠페인</a>
			<a href={`${data.paths.success}?paymentId=${encodeURIComponent(pay.id)}`} class="btn pri" data-sveltekit-reload>다시 확인</a>
		</div>
	</section>
{:else if pay.status === 'CONFIRMED'}
	<section class="card static">
		<h4 style="margin:0 0 8px">결제 완료 ✓</h4>
		<p class="meta" style="margin:0 0 10px">샘플 구매가 완료됐어요 — 브랜드가 발송하면 캠페인 스레드에 운송장이 표시됩니다.</p>
		<div class="btnrow" style="justify-content:flex-end">
			{#if data.paths.campaign}<a href={data.paths.campaign} class="btn pri">캠페인 보기 →</a>{:else}<a href={data.paths.campaigns} class="btn pri">내 캠페인</a>{/if}
		</div>
	</section>
{:else if pay.status === 'REFUNDED'}
	<section class="card static">
		<h4 style="margin:0 0 8px">환불 완료</h4>
		<p class="meta" style="margin:0 0 10px">이 샘플 구매는 취소·환불됐어요. 🥬 로 낸 금액은 잔액으로, 현금은 결제 수단으로 돌아갑니다(카드사 기준 3~7일).</p>
		<div class="btnrow" style="justify-content:flex-end">
			{#if data.paths.retry}<a href={data.paths.retry} class="btn">다시 구매</a>{/if}
			<a href={data.paths.campaigns} class="btn pri">내 캠페인</a>
		</div>
	</section>
{:else}
	<section class="card static">
		<h4 style="margin:0 0 8px">{data.chip.label}</h4>
		<div class="notice danger" role="alert" style="margin:0 0 10px">{data.failText ?? '결제를 완료하지 못했어요'}</div>
		{#if pay.fail_code}<div class="meta" style="font-family:var(--font-mono);font-size:11px;margin-bottom:10px">코드 {pay.fail_code}</div>{/if}
		<div class="btnrow" style="justify-content:flex-end">
			<a href={data.paths.product} class="btn">상품 상세</a>
			{#if data.paths.retry}<a href={data.paths.retry} class="btn pri">다시 시도</a>{/if}
		</div>
	</section>
{/if}
