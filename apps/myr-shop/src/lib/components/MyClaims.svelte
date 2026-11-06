<script lang="ts">
	/** 마이 "교환 · 환불 요청"(0078 myr_app_claims_of_user · 최근순). 한 줄: 상품 타일 · 상태 칩 · 종류/사유 · 상대 시각 · 상품 × 수량 · 지금 단계 · 크리에이터 메시지 첫 줄.
	 *  누르면 주문 상세의 그 요청 카드로(#claim-<code>) — 처리 내역 · 교환 송장은 그 카드 하나가 보여 준다(같은 내용을 두 곳에 그리지 않는다). */
	import { CLAIM_STATUS_LABEL, claimStepText, KIND_LABEL, type Claim } from '@sellery/myr-core/claim-rules';
	import { relTime } from '@sellery/myr-core/cs-rules';
	import Tile from '$lib/components/Tile.svelte';

	let { items }: { items: Claim[] } = $props();
	// 주문 상세 요청 카드와 같은 색
	const claimTone: Record<string, string> = { pending: 'bg-white/8 text-white/85', progress: 'bg-accent/12 text-accent', done: 'bg-[#4ade80]/12 text-[#4ade80]', rejected: 'bg-white/6 text-white/50' };
</script>

<div class="flex flex-col gap-2.5">
	{#each items as c (c.id)}
		<a href="/orders/{c.order.code}#claim-{c.code}" class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-fg transition-colors lg:gap-3.5 lg:rounded-[20px] lg:py-4 lg:hover:border-white/25">
			{#if c.product}<Tile tile={c.product.tile ?? ''} ic={c.product.icon} thumbUrl={c.product.thumbUrl} alt="" icon={22} class="h-11 w-11 shrink-0 rounded-xl" />{/if}
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-1.5 text-[11.5px] text-fg-faint"><span class="rounded-[6px] px-1.5 py-[2px] text-[11px] font-bold {claimTone[c.status]}">{CLAIM_STATUS_LABEL[c.status]}</span>{KIND_LABEL[c.kind]} · {c.reason} · {relTime(c.createdAt)}</span>
				<span class="mt-1 block truncate text-[14px] font-bold lg:text-[15px]">{c.order.item.name}{c.order.item.option ? ` · ${c.order.item.option}` : ''} × {c.qty}</span>
				<span class="mt-0.5 block truncate text-[12px] text-fg-soft">{claimStepText(c)}</span>
				{#if c.message}<span class="mt-0.5 block truncate text-[12px] text-fg-faint"><span class="font-bold text-accent">{c.seller?.name ?? '크리에이터'}</span> {c.message}</span>{/if}
			</span>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-fg-faint"><path d="M9 6l6 6-6 6" /></svg>
		</a>
	{/each}
</div>
