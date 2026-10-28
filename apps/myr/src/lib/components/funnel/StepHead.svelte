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
<!-- tabindex=-1: 단계가 바뀌면 퍼널(Funnel.svelte)이 여기로 포커스를 옮긴다 — 화면이 통째로 교체돼 포커스가 body 로 떨어지는 것을 막고, 스크린리더에 새 질문을 읽힌다. 제목이라 포커스 링은 없앤다 -->
<h1 tabindex="-1" class="{h1Cls} outline-none">{title[0]} <br class="lg:hidden" />{title[1]}</h1>
<p class={helperCls}>{help}</p>
