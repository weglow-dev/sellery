<script lang="ts">
	import { eyebrowCls, h1Cls, helperCls } from './shared';

	/** 질문 화면 머리 — 눈썹(Q번호 · 이름) · 제목 두 줄(모바일만 줄바꿈) · 도움말 */
	let {
		eyebrow,
		optional = false,
		title,
		help
	}: { eyebrow: string; optional?: boolean; title: [string, string]; help: string } = $props();
</script>

<p class={eyebrowCls}>{eyebrow}{#if optional} <span class="font-semibold text-fg/50">(선택)</span>{/if}</p>
<h1 class={h1Cls}>{title[0]} <br class="lg:hidden" />{title[1]}</h1>
<p class={helperCls}>{help}</p>
