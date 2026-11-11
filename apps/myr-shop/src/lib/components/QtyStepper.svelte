<script lang="ts">
	/** 수량 −/+ — 상품 상세(큰 것)와 장바구니 줄(작은 것) 공용 · disabled = 품절(흐리게 · 안 눌림).
	 *  끝에 닿으면 그쪽 버튼만 끈다(1 이면 − · MAX_QTY 면 +) — 상한은 서버(0057 장바구니 · 0058 체크아웃)와 같은 MAX_QTY */
	import { MAX_QTY } from '$lib/data';
	let { qty, min = 1, max = MAX_QTY, onchange, size = 'lg', disabled = false }: { qty: number; min?: number; max?: number; onchange: (q: number) => void; size?: 'lg' | 'sm'; disabled?: boolean } = $props();
	const lg = $derived(size === 'lg');
	const atMin = $derived(qty <= min);
	const atMax = $derived(qty >= max);
</script>

<div class="flex shrink-0 items-center border border-white/12 {lg ? 'h-14 rounded-2xl bg-white/4' : 'h-[34px] rounded-[10px]'} {disabled ? 'opacity-40' : ''}" aria-disabled={disabled}>
	<button type="button" disabled={disabled || atMin} onclick={() => onchange(Math.max(min, qty - 1))} aria-label="수량 줄이기" class="h-full text-fg disabled:cursor-not-allowed disabled:opacity-30 {lg ? 'w-11 text-[20px]' : 'w-8 text-[16px]'}">−</button>
	<span class="text-center font-extrabold tabular-nums {lg ? 'min-w-[22px] text-[16px]' : 'min-w-[18px] text-[13px]'}">{qty}</span>
	<button type="button" disabled={disabled || atMax} onclick={() => onchange(Math.min(max, qty + 1))} aria-label={atMax ? `수량 늘리기 (최대 ${max}개)` : '수량 늘리기'} title={atMax ? `한 번에 ${max}개까지 담을 수 있어요` : undefined} class="h-full text-fg disabled:cursor-not-allowed disabled:opacity-30 {lg ? 'w-11 text-[20px]' : 'w-8 text-[16px]'}">+</button>
</div>
