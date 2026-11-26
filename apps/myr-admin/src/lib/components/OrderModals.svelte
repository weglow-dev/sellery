<script module lang="ts">
	/** 주문 동작 모달을 여는 곳 — 주문 서랍 · 배송 완료 예외 줄 어디서든 같은 모달(화면마다 <OrderModals /> 하나).
	 *  ship = 송장 입력(운영이 직접) · 정정(송장이 있으면 정정) · delivered = 배송 완료 기록 · refund = 예외 환불 */
	export type OrderModalKind = 'ship' | 'delivered' | 'refund';
	class OrderModal {
		open = $state<{ kind: OrderModalKind; id: string } | null>(null);
		show(kind: OrderModalKind, id: string) {
			this.open = { kind, id };
		}
		close() {
			this.open = null;
		}
	}
	export const orderModal = new OrderModal();
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { won } from '$lib/format';
	import { CARRIERS, TODAY, orders } from '$lib/mock/orders.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT, TEXTAREA } from '$lib/ui';
	import Field from './Field.svelte';
	import Modal from './Modal.svelte';

	/** 주문 동작 모달(§6-2 · §6-4 · 시안 2026-11-26) — 송장 입력/정정(택배사 고르기 + 운송장) · 배송 완료(실제 배송일 · 자동으로 끝나지 않는 주문만) · 예외 환불(사유 필수 · 한 번 더 확인).
	 *  거절 문구 · 결과 문구는 서버(목) 값 — 거절이면 Modal 안에 보여 주고 닫지 않는다 */
	const m = $derived(orderModal.open);
	const v = $derived(m ? orders.view(m.id) : undefined);
	const fix = $derived(!!v?.ship);

	let carrier = $state('');
	let tracking = $state('');
	let date = $state(TODAY);
	let why = $state('');

	$effect(() => {
		if (!m) return;
		untrack(() => {
			carrier = v?.ship?.carrier ?? CARRIERS[0];
			tracking = v?.ship?.tracking ?? '';
			date = TODAY;
			why = '';
		});
	});

	function done(r: { ok: boolean; msg: string }) {
		if (!r.ok) return r.msg;
		app.showToast(r.msg);
		orderModal.close();
	}
	const close = () => orderModal.close();
</script>

{#if m?.kind === 'ship' && v}
	<Modal title={fix ? '송장 정정' : '송장 입력'} desc="{v.id} · {v.recipient[0].masked}" ok={fix ? '정정' : '송장 저장'} info={fix ? '정정하면 고객에게 바뀐 운송장으로 다시 알려요' : '운영이 직접 등록하는 송장이에요 · 저장하면 주문이 배송 중으로 바뀌어요'} onclose={close} onok={() => done(orders.ship(v.id, carrier, tracking))}>
		<div class="flex flex-col gap-1.5">
			<span class="text-[13px] font-semibold text-white/80">택배사</span>
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="택배사">
				{#each CARRIERS as c (c)}
					{@const on = carrier === c}
					<button type="button" aria-pressed={on} onclick={() => (carrier = c)} class="h-[42px] rounded-xl border px-[15px] text-[13.5px] font-semibold transition-colors {on ? 'border-white/22 bg-[#2a2c33] text-fg' : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white/85'}">{c}</button>
				{/each}
			</div>
		</div>
		<Field label="운송장">
			<input bind:value={tracking} inputmode="numeric" class="{INPUT} tabular-nums" placeholder="숫자와 - 만 입력" />
		</Field>
	</Modal>
{:else if m?.kind === 'delivered' && v}
	<Modal title="배송 완료" desc={v.ship ? `${v.id} · ${v.ship.carrier} ${v.ship.tracking}` : v.id} ok="배송 완료로 기록" info="배송 완료로 기록하면 이 주문이 그달 정산에 들어가요" onclose={close} onok={() => done(orders.markDelivered(v.id, date))}>
		<Field label="실제 배송일" hint="택배 조회에서 확인한 날짜를 적어 주세요">
			<input type="date" bind:value={date} max={TODAY} class={INPUT} />
		</Field>
		<ul class="flex flex-col gap-1 text-[13px] leading-[1.5] text-white/60">
			<li class="flex gap-2"><span class="shrink-0 text-white/40" aria-hidden="true">•</span>택배사가 배송 완료를 알려 주거나 발송 10일이 지나면 자동으로 배송 완료돼요</li>
			<li class="flex gap-2"><span class="shrink-0 text-white/40" aria-hidden="true">•</span>배송 완료 예외처럼 자동으로 끝나지 않는 주문만 택배 조회 후 기록해 주세요</li>
		</ul>
	</Modal>
{:else if m?.kind === 'refund' && v}
	<Modal title="예외 환불" desc="{v.id} · {won(v.amount)}" ok="환불" sure="정말 환불하기" danger info="정말 환불할까요? 결제 수단으로 {won(v.amount)}이 바로 환불돼요" infoTone="orange" disabled={!why.trim()} onclose={close} onok={() => done(orders.refundException(v.id, why))}>
		<Field label="사유(필수)" count="{why.length}/200" hint="고객 환불 메일과 크리에이터 환불 메일에도 이 사유가 그대로 보여요">
			<textarea bind:value={why} maxlength="200" rows="3" class={TEXTAREA} placeholder="고객에게 보여도 되는 말로 적어 주세요"></textarea>
		</Field>
		<p class="rounded-xl border border-danger/28 bg-danger/10 px-3.5 py-3 text-[13px] leading-[1.45] font-semibold text-danger-fg">교환 · 환불 요청 없이 운영이 바로 환불해요</p>
	</Modal>
{/if}
