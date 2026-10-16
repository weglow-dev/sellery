<script lang="ts">
	import type { Snippet } from 'svelte';
	import TileGroup from '../TileGroup.svelte';
	import StepHead from './StepHead.svelte';
	import UnsureButton from './UnsureButton.svelte';
	import NextFoot from './NextFoot.svelte';
	import { UNSURE } from '$lib/utils/apply-options';
	import { bodyCls, errCls, scrollCls } from './shared';

	/** 타일을 골라 넘어가는 질문 화면(카테고리 · 제형 · 세부 종류 · 패키지 · 맛) 한 벌.
	 *  탭하면 onpick 이 값과 함께 불리고(퍼널이 0.28초 뒤 다음으로), unsure 가 켜져 있으면 아래에 "아직 모르겠어요" 버튼이 붙는다.
	 *  children 은 타일 아래 덧붙일 내용(카테고리의 최소 수량 안내 카드). */
	let {
		eyebrow,
		title,
		help,
		options,
		value,
		layout = 'grid',
		desc,
		swatch,
		label,
		error,
		unsure = false,
		showNext,
		onpick,
		onnext,
		children
	}: {
		eyebrow: string;
		title: [string, string];
		help: string;
		options: readonly string[];
		value: string;
		layout?: 'grid' | 'grid-lg' | 'row' | 'swatch';
		desc?: Record<string, string>;
		swatch?: Record<string, string>;
		label: string;
		error?: string;
		unsure?: boolean;
		showNext: boolean;
		onpick: (value: string) => void;
		onnext: () => void;
		children?: Snippet;
	} = $props();
</script>

<div class={scrollCls}>
	<StepHead {eyebrow} {title} {help} />
	<div class="mt-[22px] {bodyCls} lg:mt-7">
		<TileGroup {options} {value} {label} {layout} {desc} {swatch} {onpick} />
		{#if error}<p class={errCls}>{error}</p>{/if}
	</div>
	{#if unsure}<UnsureButton on={value === UNSURE} onclick={() => onpick(UNSURE)} />{/if}
	{@render children?.()}
</div>
<NextFoot show={showNext} {onnext} />
