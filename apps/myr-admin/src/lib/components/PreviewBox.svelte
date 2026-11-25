<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 심사 미리보기의 섹션 칸 — 왼쪽 위 태그(01 기본 정보 · 구매 패널 · 02 레시피 노트 …) · 오른쪽 위 [의견 달기]/[의견 고치기].
	 *  의견이 있는 칸은 주황 테두리 · 주황 태그(시안 상품 심사). [의견 달기]는 PC 에서만 */
	let { box, onop, children }: { box: { tag: string; on: boolean; opLabel: string }; onop: () => void; children: Snippet } = $props();
</script>

<div class="relative rounded-[22px] border px-[18px] pt-6 pb-[18px] transition-colors {box.on ? 'border-accent/65 bg-accent/5' : 'border-white/10 bg-white/3'}">
	<span class="absolute -top-[11px] left-3.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold whitespace-nowrap transition-colors {box.on ? 'bg-accent text-bg' : 'bg-[#24262c] text-white/75'}">{box.tag}</span>
	<button
		type="button"
		onclick={onop}
		class="absolute -top-4 right-3.5 hidden h-8 rounded-full border bg-[#15161a] px-3 text-[12.5px] font-bold whitespace-nowrap transition-colors hover:border-accent hover:text-[#ff9a66] lg:block {box.on ? 'border-accent/65 text-[#ff9a66]' : 'border-white/16 text-white/75'}"
	>
		{box.opLabel}
	</button>
	{@render children()}
</div>
