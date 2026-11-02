<script lang="ts">
	/** 환불 신청 — 줄마다 체크박스 카드(수량 2개 이상이면 체크 뒤 수량 선택) · 사유 드롭다운(빈 값으로 시작 · 필수) + 상세(선택) → 확인 단계(인라인) → POST /api/payments/cancel → 주문 다시 읽기.
	 *  브라우저 confirm() 은 쓰지 않는다. 금액은 화면 추정(estimateRefund)이고 서버 precheck 가 다시 계산한다. 입금 대기 주문은 "주문 취소"(토스 호출 없음).
	 *  서버로 가는 reason 은 `사유 — 상세`(REASON_MAX 안) 한 줄 — 서버·DB 는 그대로(composeReason · refund-rules.ts). */
	import { invalidateAll } from '$app/navigation';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import type { OrderView } from '$lib/order-view';
	import Tile from '$lib/components/Tile.svelte';
	import { composeReason, customerCanRefund, estimateRefund, refundableItems, refundMessage, REFUND_REASONS, remainingQty, type RefundLine } from '$lib/refund-rules';

	let { order }: { order: OrderView } = $props();
	const can = $derived(customerCanRefund(order));
	const lines = $derived(refundableItems(order.items));

	let open = $state(false);
	let confirming = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let reason = $state<string>('');
	let detail = $state('');
	let qtyById = $state<Record<string, number>>({});

	const chosen = $derived<RefundLine[]>(Object.entries(qtyById).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty })));
	const est = $derived(estimateRefund(order, chosen));
	const deposit = $derived(can.ok && can.deposit);
	const canProceed = $derived(deposit || (chosen.length > 0 && reason !== ''));

	function start() {
		qtyById = Object.fromEntries(lines.map((l) => [l.id, remainingQty(l)]));
		reason = '';
		detail = '';
		open = true;
		confirming = false;
		error = null;
	}
	function toggle(id: string, max: number, on: boolean) {
		qtyById = { ...qtyById, [id]: on ? max : 0 };
	}
	function setQty(id: string, max: number, v: number) {
		qtyById = { ...qtyById, [id]: Math.max(1, Math.min(max, v)) };
	}
	async function submit() {
		if (submitting) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/payments/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderCode: order.code, items: deposit ? [] : chosen.map((c) => ({ itemId: c.item_id, qty: c.qty })), reason: deposit ? composeReason(reason || '고객 요청', detail) : composeReason(reason, detail) })
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
	const checkCls =
		'h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-white/25 bg-transparent transition-colors checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%230a0b0e%27%20stroke-width=%273%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M5%2012.5l4.5%204.5L19%207.5%27/%3E%3C/svg%3E")] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat disabled:cursor-not-allowed disabled:opacity-30';
	const fieldCls = 'mt-2 w-full rounded-[14px] border border-white/10 bg-white/4 px-4 text-[14px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-50';
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
				<p class="mt-4 text-[13px] font-bold text-fg-soft">환불할 제품</p>
				<div class="mt-2 flex flex-col gap-2">
					{#each lines as it (it.id)}
						{@const max = remainingQty(it)}
						{@const q = qtyById[it.id] ?? 0}
						{@const on = q > 0}
						<div class="rounded-[14px] border px-3.5 py-3 transition-colors {on ? 'border-accent bg-accent/8' : 'border-white/10 bg-white/4'}">
							<label class="flex min-w-0 cursor-pointer items-center gap-3">
								<input type="checkbox" class={checkCls} checked={on} disabled={submitting} onchange={(e) => toggle(it.id, max, e.currentTarget.checked)} aria-label="{it.name} 선택" />
								<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt="" icon={22} class="h-11 w-11 rounded-[10px]" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[13.5px] font-bold">{it.name}{#if it.option} · {it.option}{/if}</span>
									<span class="mt-0.5 block text-[12px] text-fg-faint">{on ? q : max}개 · {won(it.unitPrice * (on ? q : max))}</span>
								</span>
							</label>
							{#if on && max > 1}
								<div class="mt-2.5 flex items-center justify-between border-t border-white/8 pt-2.5">
									<span class="text-[12px] text-fg-faint">환불 수량</span>
									<div class="flex items-center gap-1 rounded-[10px] border border-white/12" role="group" aria-label="{it.name} 환불 수량">
										<button type="button" aria-label="수량 줄이기" onclick={() => setQty(it.id, max, q - 1)} disabled={submitting || q <= 1} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">−</button>
										<span class="w-6 text-center text-[13px] font-bold tabular-nums">{q}</span>
										<button type="button" aria-label="수량 늘리기" onclick={() => setQty(it.id, max, q + 1)} disabled={submitting || q >= max} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">+</button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				<p class="mt-5 text-[13px] font-bold text-fg-soft">환불 사유</p>
				<select bind:value={reason} disabled={submitting} aria-label="환불 사유" class="{fieldCls} h-12 {reason === '' ? 'text-fg-faint' : ''}">
					<option value="" disabled>사유를 선택하세요</option>
					{#each REFUND_REASONS as r (r)}<option value={r}>{r}</option>{/each}
				</select>
				<textarea bind:value={detail} disabled={submitting} rows="2" maxlength="150" placeholder="상태나 상황을 적어주시면 더 빠르게 처리돼요 (선택)" aria-label="상세 사유" class="{fieldCls} resize-none py-3 leading-[1.5]"></textarea>
				<div class="mt-4 flex items-baseline justify-between text-[14px]">
					<span class="text-fg-soft">예상 환불 금액{#if est.full && order.shippingFee} <span class="text-[12px] text-fg-faint">(배송비 포함)</span>{/if}</span>
					<span class="text-[18px] font-extrabold text-accent">{won(est.amount)}</span>
				</div>
				<p class="mt-1 text-[12px] text-fg-faint">발송 전 주문만 환불할 수 있어요.</p>
			{/if}
			{#if error}<p role="alert" class="mt-3 rounded-[12px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3 py-2.5 text-[13px] text-white/85">{error}</p>{/if}
			{#if !confirming}
				<div class="mt-3 flex gap-2">
					<button type="button" onclick={() => (open = false)} disabled={submitting} class="{btn} border border-white/14 text-fg">닫기</button>
					<button type="button" onclick={() => (confirming = true)} disabled={submitting || !canProceed} class="{btn} bg-accent text-bg disabled:bg-white/8 disabled:text-white/40">{deposit ? '취소 진행' : '환불 진행'}</button>
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
