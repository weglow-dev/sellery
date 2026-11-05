<script lang="ts">
	import { STEP_NAMES } from '$lib/rules';
	import Icon from '../Icon.svelte';
	import ExampleBody from './ExampleBody.svelte';

	/** 모바일 에디터 [예시] 바텀시트 — 화면 높이 90% · 바깥 탭·Esc 로 닫기. PC 는 상품 등록 화면 오른쪽 고정 패널이 같은 본문을 늘 보여 준다 */
	/** prefix · stepName — 머리 아래 "지금 작성 중 · 단계" 줄. prefix 가 비면(수정 모드) 그 줄을 그리지 않는다 */
	let { step, onclose, prefix = '지금 작성 중', stepName = undefined }: { step: number; onclose: () => void; prefix?: string; stepName?: string } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<div class="absolute inset-0 z-30 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="완성된 상세페이지 예시">
	<button type="button" class="absolute inset-0 bg-black/62" aria-label="닫기" onclick={onclose}></button>
	<div class="relative flex h-[90%] animate-up-in flex-col rounded-t-[28px] border-t border-white/12 bg-[#0d0e12]">
		<div class="flex shrink-0 justify-center pt-2"><span class="h-1 w-10 rounded-sm bg-white/20"></span></div>
		<div class="flex shrink-0 items-center gap-2.5 px-5 py-3">
			<span class="rounded-lg bg-accent/14 px-[9px] py-[5px] text-[11px] font-extrabold tracking-[0.06em] text-accent">예시</span>
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-extrabold">완성된 상세페이지</p>
				{#if prefix}<p class="mt-0.5 text-[12px] text-white/55">{prefix} · <b class="font-bold text-accent">{stepName ?? STEP_NAMES[step - 1]}</b></p>{/if}
			</div>
			<button type="button" onclick={onclose} aria-label="닫기" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/6 text-fg">
				<Icon id="x" size={18} sw={2.2} />
			</button>
		</div>
		<ExampleBody {step} class="pb-12" />
	</div>
</div>
