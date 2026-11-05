<script lang="ts">
	import type { Product } from '$lib/data';
	import type { ProductMenuItem } from '$lib/product-draft';
	import { REVISION_PENDING_TOAST } from '$lib/product-edit';
	import { PRODUCT_STATUS_META } from '$lib/rules';
	import Badge from './Badge.svelte';
	import Icon from './Icon.svelte';
	import Tile from './Tile.svelte';

	/** 내 제품 메뉴 — 상품을 누르면(모바일 바텀시트 · PC 가운데 카드). 판매 종료 · 삭제는 한 번 더 확인(브라우저 confirm 대신 시트 안에서).
	 *  항목은 product-draft.ts productMenu(상태별) · 실행은 부모(onpick) */
	let { product, items, busy = false, onpick, onclose }: { product: Product; items: ProductMenuItem[]; busy?: boolean; onpick: (it: ProductMenuItem) => void; onclose: () => void } = $props();
	let confirming = $state<ProductMenuItem | null>(null);
	const m = $derived(PRODUCT_STATUS_META[product.status]);

	function choose(it: ProductMenuItem) {
		if (it.confirm && confirming !== it) confirming = it;
		else onpick(it);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div class="fixed inset-0 z-40 flex flex-col justify-end lg:items-center lg:justify-center" role="dialog" aria-modal="true" aria-label="{product.name} 메뉴">
	<button type="button" class="absolute inset-0 bg-black/62" aria-label="닫기" onclick={onclose}></button>
	<div class="relative animate-up-in rounded-t-[28px] border-t border-white/12 bg-[#0d0e12] px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:w-[420px] lg:rounded-[24px] lg:border lg:px-6 lg:pt-6 lg:pb-6">
		<div class="flex justify-center pb-3 lg:hidden"><span class="h-1 w-10 rounded-sm bg-white/20"></span></div>
		<div class="flex items-center gap-3">
			<Tile tile={product.tile} thumbUrl={product.thumbUrl} bg={product.bg} iconId={product.iconId} icon={28} class="h-12 w-12 rounded-[12px]" />
			<div class="min-w-0 flex-1">
				<Badge cls={m.cls}>{m.label}</Badge>
				<p class="mt-1 truncate text-[15px] font-bold">{product.name}</p>
			</div>
			<button type="button" onclick={onclose} aria-label="닫기" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/6 text-fg"><Icon id="x" size={18} sw={2.2} /></button>
		</div>
		{#if product.revision?.state === 'review' && !confirming}
			<p class="mt-4 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3 text-[13px] leading-[1.55] text-white/80" role="status">{REVISION_PENDING_TOAST}</p>
		{/if}
		{#if confirming}
			<p class="mt-5 text-[14px] leading-[1.6] text-white/80" role="alert">{confirming.confirm}</p>
			<div class="mt-4 flex gap-2">
				<button type="button" onclick={() => (confirming = null)} class="h-12 flex-1 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold">취소</button>
				<button type="button" disabled={busy} onclick={() => confirming && onpick(confirming)} class="h-12 flex-1 rounded-2xl bg-[#ff6b6b] text-[14px] font-extrabold text-bg disabled:opacity-60">{busy ? '처리 중…' : confirming.label}</button>
			</div>
		{:else}
			<div class="mt-4 flex flex-col gap-2">
				{#each items as it (it.kind)}
					<button type="button" disabled={busy} onclick={() => choose(it)} class="flex h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/3 px-4 text-left text-[14px] font-bold transition-colors lg:hover:border-white/30 {it.danger ? 'text-[#ff8a8a]' : 'text-fg'}">
						{it.label}<Icon id="chev" size={16} sw={2.2} class="text-white/35" />
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
