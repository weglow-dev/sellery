<script lang="ts">
	import { won } from '$lib/format';
	import { orders, type OrderAction } from '$lib/mock/orders.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import Btn from './Btn.svelte';
	import Chip from './Chip.svelte';
	import CopyButton from './CopyButton.svelte';
	import Drawer from './Drawer.svelte';
	import KV from './KV.svelte';
	import MaskValue from './MaskValue.svelte';
	import { orderModal } from './OrderModals.svelte';
	import ProductThumb from './ProductThumb.svelte';
	import Section from './Section.svelte';
	import Timeline from './Timeline.svelte';

	/** 주문 상세(오른쪽 서랍 · §6-2) — 머리(주문번호 · 결제일 · 주문자 · 상태 · 금액) · 주문 줄 표 · 수취인 · 결제(가린 값 + 보기) · 송장 · 처리 이력.
	 *  열림은 주소(?id=)가 가진다 — 주문 목록 · 송장 일괄 입력 · 배송 완료 예외 어디서든 같은 서랍. 아래 버튼은 서버 값 actions 순서 그대로 */
	let { id, onclose }: { id: string; onclose: () => void } = $props();
	const v = $derived(orders.view(id));
	const has = (a: OrderAction) => !!v?.actions.includes(a);
</script>

{#if v}
	<Drawer title="주문 {v.id}" {onclose}>
		{#snippet head()}
			<div class="flex items-center gap-3">
				<ProductThumb tile={v.thumb.tile} icon={v.thumb.icon} size={48} radius={14} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-[17px] font-extrabold">{v.title}</p>
					<p class="truncate text-[13px] text-white/55 tabular-nums">{v.sub}</p>
				</div>
				<Chip label={v.chip.label} tone={v.chip.tone} lg />
			</div>
			<div class="mt-5 flex items-end justify-between gap-3 rounded-3xl bg-white/4 p-5">
				<div class="min-w-0">
					<p class="text-[12px] text-white/55">결제 금액</p>
					<p class="mt-1 text-[28px] font-extrabold tracking-[-0.03em] tabular-nums">{won(v.amount)}</p>
				</div>
				<a href="/creators?id={v.creator.id}" class="shrink-0 text-right text-[13px] font-bold text-white/60 hover:text-fg"><span class="block text-[12px] font-medium text-white/45">크리에이터</span>{v.creator.name} {v.creator.handle}</a>
			</div>
		{/snippet}

		<Section title="주문 줄">
			{#snippet aside()}{v.lines.length}줄{/snippet}
			<div class="overflow-x-auto">
				<div class="min-w-[320px]">
					<div class="grid grid-cols-[minmax(0,1fr)_50px_96px] gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] font-semibold text-white/42"><span>상품</span><span class="text-right">수량</span><span class="text-right">금액</span></div>
					{#each v.lines as l (l.productId)}
						<div class="grid min-h-[56px] grid-cols-[minmax(0,1fr)_50px_96px] items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] last:border-b-0">
							<span class="flex min-w-0 items-center gap-2.5"><ProductThumb tile={l.thumb.tile} icon={l.thumb.icon} size={36} radius={10} /><span class="truncate font-semibold">{l.name}</span></span>
							<span class="text-right text-white/80 tabular-nums">{l.qtyText}</span>
							<span class="text-right font-bold tabular-nums">{l.amountText}</span>
						</div>
					{/each}
				</div>
			</div>
		</Section>

		<Section title="수취인 · 결제">
			<div class="rounded-2xl border border-white/8 px-4 py-1">
				{#each v.recipient as r (r.k)}
					<KV k={r.k}><MaskValue masked={r.masked} raw={r.raw} what={r.k} /></KV>
				{/each}
				<KV k="결제"><span class="tabular-nums">{v.payment}</span></KV>
				<KV k="크리에이터"><a href="/creators?id={v.creator.id}" class="underline-offset-2 hover:underline">{v.creator.name} {v.creator.handle}</a></KV>
				{#if v.note}<KV k="메모">{v.note}</KV>{/if}
			</div>
			<p class="mt-2 px-1 text-[12px] text-white/55">원문을 보면 열람 기록이 남아요</p>
		</Section>

		<Section title="송장">
			<div class="rounded-2xl border border-white/8 px-4 py-1">
				{#if v.ship}
					<KV k="택배사">{v.ship.carrier}</KV>
					<KV k="운송장"><span class="inline-flex items-center gap-2 tabular-nums">{v.ship.tracking}<CopyButton text={v.ship.tracking} what="운송장" /></span></KV>
					<KV k="발송">{v.ship.shippedText}</KV>
					<KV k="배송 완료"><span class={v.ship.doneTone === 'plain' ? '' : NOTE_CLS[v.ship.doneTone]}>{v.ship.done}</span></KV>
				{:else}
					<KV k="송장"><span class={v.noShip.tone === 'plain' ? '' : NOTE_CLS[v.noShip.tone]}>{v.noShip.text}</span></KV>
				{/if}
			</div>
		</Section>

		{#if v.log.length}
			<Section title="처리 이력"><Timeline items={v.log} /></Section>
		{/if}

		{#snippet footer()}
			{#if v.actions.length}
				{#if has('ship')}
					<div class="flex w-full gap-2"><Btn kind="primary" full onclick={() => orderModal.show('ship', v.id)}>송장 저장</Btn></div>
				{/if}
				{#if has('fixShip') || has('delivered')}
					<div class="flex w-full gap-2">
						{#if has('fixShip')}<div class="min-w-0 flex-1"><Btn kind="ghost" full onclick={() => orderModal.show('ship', v.id)}>송장 정정</Btn></div>{/if}
						{#if has('delivered')}<div class="min-w-0 flex-[1.4]"><Btn kind="primary" full onclick={() => orderModal.show('delivered', v.id)}>배송 완료</Btn></div>{/if}
					</div>
				{/if}
				{#if has('refund')}
					<div class="flex w-full gap-2">
						<button type="button" onclick={() => orderModal.show('refund', v.id)} class="inline-flex h-11 w-full items-center justify-center rounded-xl border border-danger/28 bg-danger/10 px-4 text-[14px] font-bold text-danger-fg transition hover:bg-danger/16">예외 환불</button>
					</div>
				{/if}
			{:else}
				<p class="w-full py-2 text-center text-[13px] text-white/55">{v.status === 'wait' ? '입금이 확인되면 결제 완료로 바뀌어요' : '끝난 주문이에요 · 할 일이 없어요'}</p>
			{/if}
		{/snippet}
	</Drawer>
{/if}
