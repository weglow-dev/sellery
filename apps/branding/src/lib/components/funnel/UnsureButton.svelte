<script lang="ts">
	import { UNSURE_LABEL } from '$lib/utils/apply-options';

	/** "아직 모르겠어요 · 미팅 때 정할게요" 점선 버튼 — 제형 · 세부 종류 · 패키지 · 맛 화면 아래 */
	let { on, onclick }: { on: boolean; onclick: () => void } = $props();
</script>

<button
	type="button"
	aria-pressed={on}
	{onclick}
	class="mt-3 min-h-[52px] w-full rounded-2xl border-[1.5px] border-dashed text-[15px] font-semibold text-fg/75 transition active:scale-[0.98] lg:mt-3.5 lg:max-w-[900px] {on
		? 'border-accent bg-accent/10'
		: 'border-white/[0.18] hover:border-white/30'}"
>
	{UNSURE_LABEL}
</button>
