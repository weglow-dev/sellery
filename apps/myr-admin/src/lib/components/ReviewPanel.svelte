<script lang="ts">
	import { tick } from 'svelte';
	import { products } from '$lib/mock/products.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';
	import PanelBtn from './PanelBtn.svelte';

	/** 심사 오른쪽 고정 패널(§4-2 · §4-3 · 시안 상품 심사) — 의견 목록 · 자주 쓰는 의견 · [반려] · [승인]/[반영 승인].
	 *  의견은 섹션마다 하나 — 고른 의견만 펼쳐서 적고, 나머지는 두 줄 미리보기. 의견이 있으면 승인은 잠긴다(서버 locked).
	 *  반려는 한 번 더 확인 · approveSure 가 있으면 승인도 한 번 더 확인(반영 승인) */
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

	const o = $derived(products.opsOf(id));
	let armed = $state<'reject' | 'approve' | null>(null);
	let err = $state('');
	let box = $state<HTMLDivElement>();
	$effect(() => {
		void o.list.length;
		armed = null;
	});

	/** 왼쪽 [의견 달기] 뒤에 고른 의견 칸으로 커서를 옮긴다 */
	export async function focusSel() {
		await tick();
		const ta = box?.querySelector<HTMLTextAreaElement>('textarea');
		ta?.focus();
		ta?.scrollIntoView({ block: 'nearest' });
	}
	const pick = (n: number) => {
		products.pickOp(id, n);
		focusSel();
	};
	const quick = (text: string) => {
		const e = products.quickAdd(id, text);
		if (e) app.showToast(e, 'error');
		else focusSel();
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

<div class="flex min-h-[440px] flex-col gap-4 rounded-3xl border border-white/8 bg-white/3 p-[22px] lg:max-h-[calc(100dvh-128px)]">
	<div class="flex shrink-0 items-baseline justify-between">
		<h2 class="text-[17px] font-extrabold">의견 목록</h2>
		<span class="text-[13px] text-white/50 tabular-nums">{o.countText}</span>
	</div>

	{#if !o.list.length}
		<p class="flex min-h-24 flex-1 items-center justify-center rounded-2xl border border-dashed border-white/14 px-3.5 py-[18px] text-center text-[13.5px] leading-[1.6] text-white/45">왼쪽 섹션의 [의견 달기]를 눌러<br />의견을 추가해요</p>
	{:else}
		<div bind:this={box} class="thin-bar -mr-2.5 flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto pr-2.5">
			{#each o.list as op, n (op.sec)}
				{#if op.on}
					<div class="flex shrink-0 flex-col gap-2 rounded-2xl border border-accent/55 bg-accent/6 p-3">
						<div class="flex items-center gap-2">
							<span class="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-[#ff9a66]">{op.secLabel}</span>
							<span class="shrink-0 text-[12px] text-white/45 tabular-nums">{op.count}</span>
							<button type="button" onclick={() => products.delOp(id, n)} aria-label="의견 삭제" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white/50 hover:bg-danger/14 hover:text-danger-fg"><Icon id="x" size={15} sw={2.2} /></button>
						</div>
						<textarea
							value={op.text}
							oninput={(e) => products.setOpText(id, n, e.currentTarget.value)}
							rows={op.rows}
							maxlength="300"
							aria-label="의견"
							placeholder="크리에이터에게 보낼 의견을 적어 주세요"
							class="block w-full resize-none rounded-xl border border-white/10 bg-bg/35 px-[13px] py-[11px] text-[14px] leading-[1.5] text-fg outline-none focus:border-accent"
						></textarea>
					</div>
				{:else}
					<div class="relative shrink-0">
						<button type="button" onclick={() => pick(n)} class="block w-full rounded-[14px] bg-white/4 py-2.5 pr-10 pl-3 text-left transition-colors hover:bg-white/7">
							<span class="block text-[12px] font-bold text-[#ff9a66]">{op.secLabel}</span>
							<span class="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] {op.blank ? 'text-white/40' : 'text-white/75'}">{op.preview}</span>
						</button>
						<button type="button" onclick={() => products.delOp(id, n)} aria-label="의견 삭제" class="absolute top-2.5 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-danger/14 hover:text-danger-fg"><Icon id="x" size={14} sw={2.2} /></button>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="shrink-0 border-t border-white/8 pt-3.5">
		<div class="flex items-baseline justify-between gap-2.5">
			<span class="text-[12.5px] font-bold text-white/60">자주 쓰는 의견</span>
			<span class="text-[12px] text-white/40">{o.quickHint}</span>
		</div>
		<div class="mt-2.5 flex flex-wrap gap-1.5">
			{#each o.quick as qk (qk.label)}
				<button type="button" disabled={!o.canQuick} onclick={() => quick(qk.text)} class="h-[34px] rounded-full border border-white/12 px-3 text-[13px] font-bold whitespace-nowrap text-white/80 transition hover:border-accent hover:text-[#ff9a66] disabled:cursor-default disabled:opacity-40 disabled:hover:border-white/12 disabled:hover:text-white/80">{qk.label}</button>
			{/each}
			<button type="button" onclick={() => (products.addOp(id, 0), focusSel())} class="h-[34px] rounded-full border border-dashed border-white/20 px-3 text-[13px] font-bold whitespace-nowrap text-white/60 hover:text-fg">+ 전체 의견</button>
		</div>
	</div>

	<div class="flex shrink-0 flex-col gap-2.5">
		{#if err}<p class="text-[13.5px] font-semibold text-danger-fg" role="alert">{err}</p>{/if}
		<div class="flex flex-col gap-2">
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
		</div>
		{#if o.locked}
			<p class="text-[13px] text-white/50">의견이 있어서 {approveLabel}은 잠겨 있어요 · 반려하면 의견이 크리에이터에게 가요</p>
		{:else if freeFoot}
			<p class="text-[13px] text-white/50">{freeFoot}</p>
		{/if}
	</div>
</div>
