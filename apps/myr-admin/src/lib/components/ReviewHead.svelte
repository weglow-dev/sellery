<script lang="ts">
	import Icon from './Icon.svelte';
	import ProductThumb from './ProductThumb.svelte';

	/** 심사 화면 머리(시안 상품 심사) — 뒤로 · 사진 · 상품명 · [신규 심사]/[수정 심사] 칩. 모바일은 사진 없이 · 칩은 제목 아래 줄 */
	let {
		r,
		label,
		backHref
	}: {
		r: { name: string; tile: string; icon: string };
		label: string;
		backHref: string;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-3 lg:min-h-[52px] lg:flex-nowrap lg:gap-x-3.5">
	<a href={backHref} aria-label="상품 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
	<span class="hidden lg:block"><ProductThumb tile={r.tile} icon={r.icon} size={48} radius={14} art={22} /></span>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{r.name}</h1>
	<span class="basis-full lg:basis-auto"><span class="inline-block shrink-0 rounded-lg bg-white/8 px-[9px] py-1 text-[12px] font-bold text-white/75">{label}</span></span>
</div>

