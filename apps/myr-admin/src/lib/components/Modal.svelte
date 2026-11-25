<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Tone } from '$lib/mock/types';
	import { NOTE_CLS } from '$lib/tone';
	import Btn from './Btn.svelte';

	/** 작은 모달 — 제목 · 설명 · 내용(입력칸) · 안내 · [취소] [확인].
	 *  sure 가 있으면 되돌릴 수 없는 동작: 첫 클릭에 버튼 줄이 [취소] [정말 ○○하기] 로 바뀐다(브라우저 확인창 없이 · §1-2).
	 *  onok 이 문자열을 돌려주면 서버 거절 안내로 버튼 위에 보여 주고 닫지 않는다 */
	let {
		title,
		desc,
		info,
		infoTone = 'plain',
		ok,
		sure,
		sureInfo,
		sureKind = 'danger',
		danger = false,
		disabled = false,
		onok,
		onclose,
		children
	}: {
		title: string;
		desc?: string;
		info?: string;
		infoTone?: Tone;
		ok: string;
		sure?: string;
		/** 두 번째 확인 때 안내 자리에 보여 줄 문구(예: 정말 승인할까요? 샵에 바로 공개돼요) */
		sureInfo?: string;
		/** 두 번째 확인 버튼 색 — 기본 빨강 · 승인처럼 되돌릴 수 없지만 위험하지 않은 동작은 주황 */
		sureKind?: 'primary' | 'danger';
		danger?: boolean;
		disabled?: boolean;
		onok: () => string | void;
		onclose: () => void;
		children?: Snippet;
	} = $props();

	let armed = $state(false);
	let err = $state('');

	function go() {
		if (sure && !armed) {
			armed = true;
			return;
		}
		const r = onok();
		if (typeof r === 'string' && r) {
			err = r;
			armed = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-[60] flex items-end justify-center p-0 lg:items-center lg:p-6">
	<button type="button" class="absolute inset-0 animate-fade-in bg-black/60" aria-label="닫기" onclick={onclose}></button>
	<div role="dialog" aria-modal="true" aria-label={title} class="relative w-full max-w-[460px] animate-sheet rounded-t-[28px] border border-white/10 bg-panel-2 px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:animate-up-in lg:rounded-[24px] lg:px-6 lg:pb-6">
		<h2 class="text-[18px] font-extrabold tracking-[-0.02em]">{title}</h2>
		{#if desc}<p class="mt-1 text-[14px] text-white/60">{desc}</p>{/if}
		{#if children}<div class="mt-4 flex flex-col gap-3">{@render children()}</div>{/if}
		{#if armed && sureInfo}<p class="mt-4 rounded-xl bg-accent/8 px-3.5 py-3 text-[13px] leading-[1.55] font-semibold text-[#ff9a66]">{sureInfo}</p>
		{:else if info}<p class="mt-4 rounded-xl bg-white/4 px-3.5 py-3 text-[13px] leading-[1.55] {NOTE_CLS[infoTone]}">{info}</p>{/if}
		{#if err}<p class="mt-3 text-[13px] leading-[1.5] font-semibold text-danger-fg" role="alert">{err}</p>{/if}
		<div class="mt-5 flex gap-2">
			<div class="flex-1"><Btn kind="ghost" full onclick={() => (armed ? (armed = false) : onclose())}>{armed ? '취소' : '닫기'}</Btn></div>
			<div class="flex-[1.4]"><Btn kind={armed ? sureKind : danger ? 'danger' : 'primary'} full {disabled} onclick={go}>{armed ? sure : ok}</Btn></div>
		</div>
	</div>
</div>
