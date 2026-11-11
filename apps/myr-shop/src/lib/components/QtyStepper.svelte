<script lang="ts">
	/** 수량 −/+ — 상품 상세(큰 것)와 장바구니 줄(작은 것) 공용 · disabled = 품절(흐리게 · 안 눌림).
	 *  1 이면 − 를 끈다. 구매 수량 상한은 없다(0095 · 실제 한도는 결제 때 재고) — max 는 숫자 형식 범위(QTY_FORMAT_MAX)만 */
	import { QTY_FORMAT_MAX } from '$lib/data';
	let { qty, min = 1, max = QTY_FORMAT_MAX, onchange, size = 'lg', disabled = false }: { qty: number; min?: number; max?: number; onchange: (q: number) => void; size?: 'lg' | 'sm'; disabled?: boolean } = $props();
	const lg = $derived(size === 'lg');
	const atMin = $derived(qty <= min);
	const atMax = $derived(qty >= max);
</script>

<div class="flex shrink-0 items-center border border-white/12 {lg ? 'h-14 rounded-2xl bg-white/4' : 'h-[34px] rounded-[10px]'} {disabled ? 'opacity-40' : ''}" aria-disabled={disabled}>
	<button type="button" disabled={disabled || atMin} onclick={() => onchange(Math.max(min, qty - 1))} aria-label="수량 줄이기" class="h-full text-fg disabled:cursor-not-allowed disabled:opacity-30 {lg ? 'w-11 text-[20px]' : 'w-8 text-[16px]'}">−</button>
	<span class="text-center font-extrabold tabular-nums {lg ? 'min-w-[22px] text-[16px]' : 'min-w-[18px] text-[13px]'}">{qty}</span>
	<button type="button" disabled={disabled || atMax} onclick={() => onchange(Math.min(max, qty + 1))} aria-label="수량 늘리기" class="h-full text-fg disabled:cursor-not-allowed disabled:opacity-30 {lg ? 'w-11 text-[20px]' : 'w-8 text-[16px]'}">+</button>
</div>
