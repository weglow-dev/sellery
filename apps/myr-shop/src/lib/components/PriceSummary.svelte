<script lang="ts">
	import { won } from '$lib/data';

	/** 상품 금액 · 배송비 · 총 결제 금액 — 장바구니 하단과 결제 화면 공용 */
	let { subtotal, shipping, total, boxed = false }: { subtotal: number; shipping: number; total: number; boxed?: boolean } = $props();
</script>

<div class="flex flex-col gap-2 text-[14px] {boxed ? 'rounded-[18px] border border-white/7 bg-white/3 p-4' : 'px-1 pb-3.5'}">
	<div class="flex justify-between text-fg-soft"><span>상품 금액</span><span class="font-semibold text-fg">{won(subtotal)}</span></div>
	<div class="flex justify-between text-fg-soft"><span>배송비</span><span class="font-semibold text-fg">{shipping ? won(shipping) : '무료'}</span></div>
	<div class="flex items-baseline justify-between border-t border-white/8 pt-2"><span class="font-bold">총 결제 금액</span><span class="text-[20px] font-extrabold text-accent">{won(total)}</span></div>
</div>
