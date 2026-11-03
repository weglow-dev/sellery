<script lang="ts">
	import type { ProductDraft } from '$lib/data';
	import { INPUT_LG, LABEL, TEXTAREA } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 3단계 왜 만들었나요 — 섹션 제목 + 본문 (선택 · 비우면 샵에서 숨김) */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const uid = $props.id();
</script>

<StepHead n={3} name="왜 만들었나요" title={'이 제품을 만든\n이유를 들려주세요'} desc="제목과 본문. 팔로워가 가장 오래 읽는 부분이에요." where="01 · 왜 만들었나요" />

<div class="mt-4 flex flex-col gap-3.5 lg:mt-5 lg:gap-4">
	<div class="flex flex-col gap-2">
		<label class={LABEL} for="{uid}-t">섹션 제목</label>
		<input id="{uid}-t" class={INPUT_LG} bind:value={ed.storyTitle} placeholder="예: 매일 챙기기 쉬운 것만 남겼어요" maxlength="40" />
	</div>
	<div class="flex flex-col gap-2">
		<label class={LABEL} for="{uid}-b">본문</label>
		<textarea id="{uid}-b" class="{TEXTAREA} lg:min-h-[196px]" rows="6" bind:value={ed.story} placeholder="어떤 고민에서 시작했고, 성분과 맛을 어떤 기준으로 골랐는지 편하게 적어주세요."></textarea>
	</div>
</div>
