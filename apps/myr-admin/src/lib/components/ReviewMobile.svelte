<script lang="ts">
	import { tick } from 'svelte';
	import { products } from '$lib/mock/products.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';
	import PanelBtn from './PanelBtn.svelte';

	/** 심사 모바일(시안 "MYR Admin" · 2026-11-25) — PC 의견 패널(ReviewPanel)의 모바일판. 값 · 판정은 같은 목 서버를 쓴다.
	 *  미리보기 아래 의견 목록 카드(두 줄 미리보기 · 삭제 · [+ 전체 의견]) · 화면 아래 고정 [반려] · [승인] 막대 · 의견 시트(섹션 · 300자 · 자주 쓰는 의견 · [삭제] · [완료]).
	 *  [의견 달기] · 목록 줄을 누르면 시트가 열린다(openSheet). [완료]인데 비어 있으면 그 의견을 지운다 */
	let {
		id,
		approveLabel,
		approveSure = '',
		approveNote = '',
		freeFoot = '',
		rejectNote,
		onreject,
		onapprove
	}: {
		id: string;
		approveLabel: string;
		approveSure?: string;
		approveNote?: string;
		freeFoot?: string;
		rejectNote: string;
		onreject: () => { ok: boolean; msg: string };
		onapprove: () => { ok: boolean; msg: string } | void;
	} = $props();

	/** 화면 등장 애니메이션(transform)이 걸린 칸 안에서는 fixed 가 화면 기준이 아니라서 — 막대 · 시트는 body 로 옮겨 그린다 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	const o = $derived(products.opsOf(id));
	const selN = $derived(o.list.findIndex((x) => x.on));
	const sel = $derived(selN >= 0 ? o.list[selN] : null);
	let open = $state(false);
	let armed = $state<'reject' | 'approve' | null>(null);
	let err = $state('');
	let ta = $state<HTMLTextAreaElement>();
	$effect(() => {
		void o.list.length;
		armed = null;
	});

	/** 모바일에서만 시트를 연다(PC 는 오른쪽 패널) */
	export async function openSheet() {
		if (window.matchMedia('(min-width: 1024px)').matches) return;
		open = true;
		await tick();
		ta?.focus();
	}
	const pick = (n: number) => {
		products.pickOp(id, n);
		openSheet();
	};
	function done() {
		if (sel?.blank) products.delOp(id, selN);
		open = false;
	}
	function drop() {
		if (selN >= 0) products.delOp(id, selN);
		open = false;
	}
	const quick = (text: string) => {
		const e = products.quickAdd(id, text);
		if (e) app.showToast(e, 'error');
	};
	function reject() {
		if (armed !== 'reject') {
			if (!o.valid) return (err = '의견을 1개 이상 적어 주세요');
			err = '';
			return (armed = 'reject');
		}
		const r = onreject();
		armed = null;
		if (!r.ok) err = r.msg;
	}
	function approve() {
		if (approveSure && armed !== 'approve') return ((err = ''), (armed = 'approve'));
		const r = onapprove();
		armed = null;
		if (r && !r.ok) err = r.msg;
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && done()} />

<div class="lg:hidden">
	<!-- 의견 목록 카드 -->
	<section class="rounded-[20px] border border-white/8 bg-white/3 p-[18px]">
		<div class="flex items-baseline justify-between">
			<h2 class="text-[16px] font-extrabold">의견 목록</h2>
			<span class="text-[13px] text-white/50 tabular-nums">{o.countText}</span>
		</div>
		{#if !o.list.length}
			<p class="mt-3 rounded-2xl border border-dashed border-white/14 px-3.5 py-5 text-center text-[13.5px] leading-[1.6] text-white/45">섹션의 [의견 달기]를 눌러<br />의견을 추가해요</p>
		{:else}
			<div class="mt-3 flex flex-col gap-2">
				{#each o.list as op, n (op.sec)}
					<div class="relative">
						<button type="button" onclick={() => pick(n)} class="block w-full rounded-[14px] bg-white/4 py-3 pr-12 pl-3.5 text-left active:bg-white/7">
							<span class="block text-[12.5px] font-bold text-[#ff9a66]">{op.secLabel}</span>
							<span class="mt-1 line-clamp-2 text-[14px] leading-[1.5] {op.blank ? 'text-white/40' : 'text-white/75'}">{op.preview}</span>
						</button>
						<button type="button" onclick={() => products.delOp(id, n)} aria-label="의견 삭제" class="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-[10px] text-white/45 active:bg-danger/14 active:text-danger-fg"><Icon id="x" size={15} sw={2.2} /></button>
					</div>
				{/each}
			</div>
		{/if}
		<button type="button" onclick={() => (products.addOp(id, 0), openSheet())} class="mt-3 h-10 rounded-full border border-dashed border-white/20 px-3.5 text-[13.5px] font-bold whitespace-nowrap text-white/60">+ 전체 의견</button>
	</section>
	<div class="h-16"></div>

	<!-- 아래 고정 버튼 막대(탭바 위를 덮는다) -->
	<div use:portal class="fixed inset-x-0 bottom-0 z-[27] mx-auto flex max-w-[430px] flex-col gap-2 border-t border-white/8 bg-bg px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden">
		{#if err}<p class="text-[13.5px] font-semibold text-danger-fg" role="alert">{err}</p>{/if}
		<div class="flex gap-2">
			{#if armed === 'reject'}
				<PanelBtn onclick={() => (armed = null)}>취소</PanelBtn>
				<PanelBtn tone="solidRed" onclick={reject}>정말 반려하기</PanelBtn>
			{:else if armed === 'approve'}
				<PanelBtn onclick={() => (armed = null)}>취소</PanelBtn>
				<PanelBtn tone="primary" onclick={approve}>{approveSure}</PanelBtn>
			{:else}
				<PanelBtn tone="danger" onclick={reject}>반려</PanelBtn>
				<PanelBtn tone="primary" disabled={o.locked} onclick={approve}>{approveLabel}</PanelBtn>
			{/if}
		</div>
		{#if armed === 'reject'}<p class="text-[12.5px] leading-[1.45] font-semibold text-danger-fg">{rejectNote}</p>{/if}
		{#if armed === 'approve' && approveNote}<p class="text-[12.5px] leading-[1.45] font-semibold text-danger-fg">{approveNote}</p>{/if}
		{#if o.locked}
			<p class="text-[12.5px] leading-[1.5] text-white/50">의견이 있어서 {approveLabel}은 잠겨 있어요 · 반려하면 의견이 크리에이터에게 가요</p>
		{:else if freeFoot}
			<p class="text-[12.5px] leading-[1.5] text-white/50">{freeFoot}</p>
		{/if}
	</div>

	<!-- 의견 시트 -->
	{#if open && sel}
		<div use:portal class="lg:hidden">
			<button type="button" aria-label="닫기" onclick={done} class="fixed inset-0 z-40 animate-fade-in bg-black/60"></button>
			<div role="dialog" aria-modal="true" aria-label="의견 달기" class="fixed inset-x-0 bottom-0 z-[41] mx-auto max-h-[90dvh] max-w-[430px] animate-sheet overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-panel px-5 pt-[26px] pb-[max(1.75rem,env(safe-area-inset-bottom))]">
				<p class="text-[12.5px] font-extrabold text-[#ff9a66]">{sel.secLabel}</p>
				<div class="mt-1 flex items-baseline justify-between gap-3">
					<h2 class="text-[22px] font-extrabold tracking-[-0.02em]">의견 달기</h2>
					<span class="shrink-0 text-[12.5px] text-white/45 tabular-nums">{sel.count}</span>
				</div>
				<textarea
					bind:this={ta}
					value={sel.text}
					oninput={(e) => products.setOpText(id, selN, e.currentTarget.value)}
					rows="5"
					maxlength="300"
					aria-label="의견"
					placeholder="크리에이터에게 보낼 의견을 적어 주세요"
					class="mt-4 block w-full resize-none rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 py-3.5 text-[15px] leading-[1.5] text-fg outline-none focus:border-accent focus:bg-accent/6"
				></textarea>
				<div class="mt-4 flex items-baseline justify-between gap-2.5">
					<span class="text-[12.5px] font-bold text-white/60">자주 쓰는 의견</span>
					<span class="text-[12px] text-white/40">누르면 의견에 덧붙여요</span>
				</div>
				<div class="mt-2.5 flex flex-wrap gap-1.5">
					{#each o.quick as qk (qk.label)}
						<button type="button" onclick={() => quick(qk.text)} class="h-[38px] rounded-full border border-white/12 px-[13px] text-[13px] font-bold whitespace-nowrap text-white/80 active:border-accent active:text-[#ff9a66]">{qk.label}</button>
					{/each}
				</div>
				<div class="mt-[22px] flex gap-2">
					<button type="button" onclick={drop} class="h-[54px] w-24 shrink-0 rounded-2xl border border-danger/28 bg-danger/10 text-[15px] font-bold text-danger-fg">삭제</button>
					<button type="button" onclick={done} class="h-[54px] flex-1 rounded-2xl border border-accent bg-accent text-[15px] font-bold text-bg">완료</button>
				</div>
			</div>
		</div>
	{/if}
</div>
