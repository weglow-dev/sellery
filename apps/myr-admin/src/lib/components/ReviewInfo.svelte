<script lang="ts">
	/** 심사 검수 정보 줄(시안 상품 심사) — 상품코드 · 크리에이터 · 연락처(가림 · [보기] 6초 뒤 다시 가림) · 제출 시각 */
	let { r }: { r: { code: string; creator: string; at: string; phone: { masked: string; raw: string } } } = $props();

	let shown = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function toggle() {
		clearTimeout(timer);
		shown = !shown;
		if (shown) timer = setTimeout(() => (shown = false), 6000);
	}
	$effect(() => () => clearTimeout(timer));
</script>

<div class="flex flex-wrap items-start gap-x-11 gap-y-3 rounded-3xl border border-white/8 bg-white/3 px-6 py-4">
	{#each [['상품코드', r.code], ['크리에이터', r.creator]] as [k, v] (k)}
		<div class="shrink-0">
			<p class="text-[12px] text-white/50">{k}</p>
			<p class="mt-[5px] flex min-h-6 items-center text-[14.5px] font-semibold whitespace-nowrap tabular-nums">{v}</p>
		</div>
	{/each}
	<div class="shrink-0">
		<p class="text-[12px] text-white/50">연락처</p>
		<p class="mt-[5px] flex min-h-6 items-center gap-2 text-[14.5px] font-semibold whitespace-nowrap tabular-nums">
			<span>{shown ? r.phone.raw : r.phone.masked}</span>
			<button type="button" onclick={toggle} class="h-6 rounded-[7px] border border-white/16 px-2 text-[11.5px] font-bold text-white/72 hover:border-white/40 hover:text-fg">{shown ? '가리기' : '보기'}</button>
		</p>
	</div>
	<div class="shrink-0">
		<p class="text-[12px] text-white/50">제출 시각</p>
		<p class="mt-[5px] flex min-h-6 items-center text-[14.5px] font-semibold whitespace-nowrap tabular-nums">{r.at}</p>
	</div>
</div>
