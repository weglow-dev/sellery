<script lang="ts">
	/**
	 * 배송 정보 조각 — 주문 상세의 택배사·송장·조회 링크·발송일 (reuse-map §1.5 glo 배송 조회 블록 개작 · web components/orders/ship-info.tsx).
	 * 송장이 없으면 파생 배송 문구(shipLabel)만.
	 */
	import { carrierName, trackingUrlOf } from '@sellery/db/carriers';
	import { md } from '@sellery/db/dates';
	import { shipLabel } from '@sellery/db/order-status';
	import type { OrderSettings, OrderView } from './types';

	let { order, settings }: { order: OrderView; settings: OrderSettings } = $props();
	const ship = $derived(shipLabel(order, order.campaign, settings));
	const url = $derived(trackingUrlOf(order.courier, order.tracking_no));
</script>

{#if !order.tracking_no}
	<div class="meta" style="margin-top:6px">
		{#if order.status === 'PAID'}송장번호: 아직 등록 전이에요{ship ? ` · ${ship}` : ''}{:else}발송 전 환불된 주문이에요{/if}
	</div>
{:else}
	<div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
		<span style="font-size:13px">
			{carrierName(order.courier)} <b style="font-family:var(--font-mono)">{order.tracking_no}</b>{#if order.shipped_at}<span class="meta"> · {md(order.shipped_at)} 발송</span>{/if}
		</span>
		{#if url}
			<a href={url} target="_blank" rel="noopener noreferrer" class="btn sm ghost">배송 조회 →<span class="sr-only"> ({carrierName(order.courier)} 새 창에서 열림)</span></a>
		{:else}
			<span class="meta">택배사 정보가 없어 조회 링크를 제공할 수 없어요 — 고객센터로 문의해주세요</span>
		{/if}
		{#if ship}<span class="meta" style="flex-basis:100%">{ship}</span>{/if}
	</div>
{/if}
