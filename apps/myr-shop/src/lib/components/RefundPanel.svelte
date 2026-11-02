<script lang="ts">
	/** 환불 신청 — 줄마다 수량 선택(남은 수량까지) · 전체 선택 · 사유 → 확인 단계(인라인) → POST /api/payments/cancel → 주문 다시 읽기.
	 *  브라우저 confirm() 은 쓰지 않는다. 금액은 화면 추정(estimateRefund)이고 서버 precheck 가 다시 계산한다. 입금 대기 주문은 "주문 취소"(토스 호출 없음). */
	import { invalidateAll } from '$app/navigation';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import type { OrderView } from '$lib/order-view';
	import { customerCanRefund, estimateRefund, refundableItems, refundMessage, REFUND_REASONS, remainingQty, type RefundLine } from '$lib/refund-rules';

	let { order }: { order: OrderView } = $props();
	const can = $derived(customerCanRefund(order));
	const lines = $derived(refundableItems(order.items));

	let open = $state(false);
	let confirming = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let reason = $state<string>(REFUND_REASONS[0]);
	let qtyById = $state<Record<string, number>>({});

	const chosen = $derived<RefundLine[]>(Object.entries(qtyById).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty })));
	const est = $derived(estimateRefund(order, chosen));
	const deposit = $derived(can.ok && can.deposit);

	function start() {
		qtyById = Object.fromEntries(lines.map((l) => [l.id, remainingQty(l)]));
		open = true;
		confirming = false;
		error = null;
	}
	function setQty(id: string, max: number, v: number) {
		qtyById = { ...qtyById, [id]: Math.max(0, Math.min(max, v)) };
	}
	async function submit() {
		if (submitting) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/payments/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderCode: order.code, items: deposit ? [] : chosen.map((c) => ({ itemId: c.item_id, qty: c.qty })), reason })
			});
			const r = (await res.json().catch(() => null)) as { ok: boolean; code?: string; message?: string; status?: string; refunded?: number } | null;
			if (!res.ok || !r?.ok) {
				error = refundMessage(r?.code ?? 'TOSS_ERROR', r?.message);
				submitting = false;
				return;
			}
			shop.showToast(deposit ? '주문을 취소했어요' : r.refunded ? `${won(r.refunded)} 환불을 접수했어요` : '환불을 접수했어요');
			open = false;
			await invalidateAll();
		} catch {
			error = refundMessage('TOSS_ERROR');
		}
		submitting = false;
	}
	const btn = 'flex h-12 flex-1 items-center justify-center rounded-[14px] text-[14px] font-bold transition-colors';
</script>

{#if can.ok}
	{#if !open}
		<button type="button" onclick={start} class="mt-3 h-12 w-full rounded-[14px] border border-white/14 text-[14px] font-bold text-fg hover:bg-white/5">{deposit ? '주문 취소' : '환불 신청'}</button>
	{:else}
		<div class="mt-3 rounded-[18px] border border-white/10 bg-white/3 p-4">
			<p class="text-[14px] font-extrabold">{deposit ? '입금 전 주문 취소' : '환불 신청'}</p>
			{#if deposit}
				<p class="mt-1.5 text-[13px] leading-[1.55] text-white/70">아직 입금 전이라 결제 없이 바로 취소돼요. 예약된 재고도 풀립니다.</p>
			{:else}
				<p class="mt-1 text-[12.5px] text-fg-faint">환불할 수량을 고르세요. 발송 전 주문만 가능해요.</p>
				<div class="mt-3 flex flex-col gap-2">
					{#each lines as it (it.id)}
						{@const max = remainingQty(it)}
						{@const q = qtyById[it.id] ?? 0}
						<div class="flex items-center gap-3 rounded-[14px] bg-white/4 px-3 py-2.5">
							<div class="min-w-0 flex-1">
								<p class="truncate text-[13px] font-bold">{it.name}{#if it.option} · {it.option}{/if}</p>
								<p class="text-[12px] text-fg-faint">{won(it.unitPrice)} · 남은 {max}개</p>
							</div>
							<div class="flex items-center gap-1 rounded-[10px] border border-white/12">
								<button type="button" aria-label="수량 줄이기" onclick={() => setQty(it.id, max, q - 1)} disabled={submitting || q <= 0} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">−</button>
								<span class="w-6 text-center text-[13px] font-bold tabular-nums">{q}</span>
								<button type="button" aria-label="수량 늘리기" onclick={() => setQty(it.id, max, q + 1)} disabled={submitting || q >= max} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">+</button>
							</div>
						</div>
					{/each}
				</div>
				<label class="mt-3 block text-[12.5px] text-fg-faint">사유
					<select bind:value={reason} disabled={submitting} class="mt-1 h-11 w-full rounded-[12px] border border-white/10 bg-bg px-3 text-[14px] text-fg">
						{#each REFUND_REASONS as r (r)}<option value={r}>{r}</option>{/each}
					</select>
				</label>
				<div class="mt-3 flex items-baseline justify-between text-[14px]">
					<span class="text-fg-soft">예상 환불 금액{#if est.full && order.shippingFee} <span class="text-[12px] text-fg-faint">(배송비 포함)</span>{/if}</span>
					<span class="text-[18px] font-extrabold text-accent">{won(est.amount)}</span>
				</div>
			{/if}
			{#if error}<p role="alert" class="mt-3 rounded-[12px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3 py-2.5 text-[13px] text-white/85">{error}</p>{/if}
			{#if !confirming}
				<div class="mt-3 flex gap-2">
					<button type="button" onclick={() => (open = false)} disabled={submitting} class="{btn} border border-white/14 text-fg">닫기</button>
					<button type="button" onclick={() => (confirming = true)} disabled={submitting || (!deposit && chosen.length === 0)} class="{btn} bg-accent text-bg disabled:bg-white/8 disabled:text-white/40">{deposit ? '취소 진행' : '환불 진행'}</button>
				</div>
			{:else}
				<p class="mt-3 text-[13px] leading-[1.55] text-white/80">{deposit ? '이 주문을 취소할까요? 되돌릴 수 없어요.' : `${won(est.amount)}을 환불할까요? 되돌릴 수 없고, 카드사에 따라 3~5일 걸려요.`}</p>
				<div class="mt-2.5 flex gap-2">
					<button type="button" onclick={() => (confirming = false)} disabled={submitting} class="{btn} border border-white/14 text-fg">아니요</button>
					<button type="button" onclick={submit} disabled={submitting} class="{btn} bg-accent text-bg disabled:opacity-60">{submitting ? '처리 중…' : deposit ? '네, 취소할게요' : '네, 환불할게요'}</button>
				</div>
			{/if}
		</div>
	{/if}
{:else}
	<p class="mt-3 text-[12px] leading-[1.55] text-fg-faint">{can.reason}</p>
{/if}
