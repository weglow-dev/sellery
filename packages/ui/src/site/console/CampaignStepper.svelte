<script lang="ts">
	/**
	 * 캠페인 스테퍼 — 프로토타입 `stepper()` (js/10-render.js) · 데모 `components/Stepper.svelte` 의 props-only 판.
	 * 정상 9단계 `CAMPAIGN_STEPS`(FLOW · FLOW_L) 를 칸으로, `stepIndex(status)` 앞은 done · 현재는 now.
	 * 종결 상태(DECLINED · REJECTED · PASSED, stepIndex −1)는 스테퍼를 그리지 않는다 — 호출자가 칩만 보인다.
	 */
	import { CAMPAIGN_STEPS, stepIndex } from '@sellery/db/partner/sample-rules';
	let { status }: { status: string } = $props();
	const idx = $derived(stepIndex(status));
</script>

{#if idx >= 0}
	<div class="console-stepper" aria-label="진행 단계">
		{#each CAMPAIGN_STEPS as s, i (s.status)}
			<span class="stp {i < idx ? 'done' : i === idx ? 'now' : ''}" aria-current={i === idx ? 'step' : undefined}>{s.label}</span>
		{/each}
	</div>
{/if}
