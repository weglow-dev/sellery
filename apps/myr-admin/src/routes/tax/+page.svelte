<script lang="ts">
	import { page } from '$app/state';
	import { won } from '$lib/format';
	import { server } from '$lib/mock/server.svelte';
	import type { TaxView } from '$lib/mock/types';
	import { app } from '$lib/state.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import { TEXTAREA } from '$lib/ui';
	import { closeDrawer, setParams } from '$lib/url';
	import Avatar from '$lib/components/Avatar.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Field from '$lib/components/Field.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KV from '$lib/components/KV.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Section from '$lib/components/Section.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 세금계산서 수취 확인 — docs/myr-admin-screens.md §12. 크리에이터가 정발행하고 낸 승인번호를 홈택스에서 대조한다.
	 *  확인하면 지급 보류(세금계산서 확인 전)가 풀려 다음 자동 이체(영업일 오후 1시 · 오후 1시 전이면 그날).
	 *  합계 · 공급가액 · 세액 · 기한 지남 · 확인 안내 · 거절 이유 · 버튼은 서버(목) 값 */
	const tabs = $derived(server.taxTabs());
	const all = $derived(server.taxes);
	const tab = $derived(page.url.searchParams.get('tab') ?? 'chk');
	const openId = $derived(page.url.searchParams.get('id'));
	const open = $derived(openId ? all.find((t) => t.id === openId) : undefined);
	const rows = $derived(all.filter((t) => t.status === tab));
	const c = $derived(server.counts);

	const EMPTY: Record<string, string> = {
		chk: '확인할 세금계산서가 없어요',
		redo: '다시 제출을 기다리는 세금계산서가 없어요',
		ok: '확인 완료된 세금계산서가 없어요',
		none: '아직 안 낸 크리에이터가 없어요'
	};

	/** 사업자번호 원문 보기 — 행마다 잠깐(열람 기록이 남는다 · §1-2 민감 정보) */
	let shown = $state<string[]>([]);
	function reveal(id: string) {
		if (shown.includes(id)) return;
		shown = [...shown, id];
		app.showToast('사업자등록번호를 열었어요 · 열람 기록이 남아요');
		setTimeout(() => (shown = shown.filter((x) => x !== id)), 8000);
	}
	function copy(no: string) {
		navigator.clipboard?.writeText(no.replace(/-/g, ''));
		app.showToast('승인번호를 복사했어요');
	}

	let modal = $state<{ kind: 'confirm' | 'redo'; t: TaxView } | null>(null);
	let why = $state('');
	const ask = (kind: 'confirm' | 'redo', t: TaxView) => {
		why = '';
		modal = { kind, t };
	};
	const openRow = (id: string) => setParams(page.url, { id }, true);
</script>

{#snippet bizNo(t: TaxView)}
	<span class="inline-flex items-center gap-1.5 tabular-nums">
		{shown.includes(t.id) ? t.bizNo : t.bizNoMasked}
		{#if !shown.includes(t.id) && t.bizNo}<button type="button" onclick={(e) => { e.stopPropagation(); reveal(t.id); }} class="rounded-md bg-white/6 px-1.5 py-0.5 text-[11px] font-bold text-white/70 hover:bg-white/12">보기</button>{/if}
	</span>
{/snippet}

{#snippet taxButtons(t: TaxView, sm: boolean, full = false)}
	{#if t.actions.includes('confirm')}<div class={full ? 'min-w-0 flex-1' : ''}><Btn kind="primary" {sm} {full} onclick={() => ask('confirm', t)}>수취 확인</Btn></div>{/if}
	{#if t.actions.includes('redo')}<div class={full ? 'min-w-0 flex-1' : ''}><Btn {sm} {full} onclick={() => ask('redo', t)}>다시 제출 요청</Btn></div>{/if}
{/snippet}

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-8 lg:pb-16">
	<PageHead title="세금계산서 수취 확인">
		{#snippet sum()}
			10월분 · 확인 대기 <b class="font-bold text-accent">{c.taxChk.length}건</b>{#if c.taxChk[0]}{' · '}가장 오래 {c.taxChk[0].waited}{/if} · 발행 기한 11월 10일 지남 <span class="font-bold text-danger-fg">{c.taxOverdue}명</span>
		{/snippet}
		{#snippet actions()}
			<a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" class="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/12 px-4 text-[14px] font-bold hover:border-white/35">홈택스 열기<Icon id="out" size={15} /></a>
		{/snippet}
	</PageHead>

	<p class="mt-5 flex items-start gap-2 rounded-2xl border border-mint/20 bg-mint/6 px-4 py-3 text-[13px] leading-[1.55] text-white/80">
		<Icon id="bolt" size={16} sw={2.2} class="mt-0.5 shrink-0 text-mint" />
		<span>확인하면 다음 자동 이체(영업일 오후 1시)에 지급돼요 · <b class="font-bold text-mint">지금(오후 1시 전) 확인하면 오늘 오후 1시</b> · 오래 기다린 순으로 보여요</span>
	</p>

	<div class="mt-6"><FilterTabs {tabs} value={tab} label="세금계산서 상태" onpick={(id) => setParams(page.url, { tab: id })} /></div>

	<!-- PC 표 -->
	<div class="mt-4 hidden overflow-hidden rounded-3xl border border-white/8 bg-white/3 lg:block">
		<table class="w-full table-fixed text-left text-[14px]">
			<thead class="border-b border-white/8 text-[12px] font-bold text-white/60">
				<tr class="h-11">
					<th class="w-[200px] pl-5">크리에이터 · 상호</th>
					<th class="w-[140px]">사업자등록번호</th>
					<th class="w-[130px] text-right">합계</th>
					<th class="pl-6">승인번호</th>
					<th class="w-[140px]">제출</th>
					<th class="w-[230px] pr-5 text-right">처리</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as t (t.id)}
					<tr onclick={() => openRow(t.id)} class="cursor-pointer border-b border-white/6 align-top transition-colors last:border-b-0 hover:bg-white/4 {openId === t.id ? 'bg-white/5' : ''}">
						<td class="py-3.5 pl-5">
							<span class="flex items-center gap-2.5">
								<Avatar initial={t.initial} bg={t.avatarBg} size={32} />
								<span class="min-w-0"><span class="block truncate font-bold">{t.name} · {t.firm}</span><span class="mt-0.5 flex flex-wrap gap-1">{#each t.payChips as pc (pc.label)}<Chip label={pc.label} tone={pc.tone} />{/each}</span></span>
							</span>
						</td>
						<td class="py-3.5 text-[13px] text-white/80">{@render bizNo(t)}</td>
						<td class="py-3.5 text-right">
							<span class="block font-extrabold tabular-nums">{won(t.total)}</span>
							<span class="block text-[12px] text-white/55 tabular-nums">공급 {won(t.supply)}</span><span class="block text-[12px] text-white/55 tabular-nums">세액 {won(t.vat)}</span>
						</td>
						<td class="py-3.5 pl-6">
							{#if t.approvalNo}
								<button type="button" onclick={(e) => { e.stopPropagation(); copy(t.approvalNo!); }} class="group inline-flex items-center gap-1.5 font-mono text-[13px] whitespace-nowrap text-white/85 hover:text-fg" title="복사">{t.approvalNo}<Icon id="copy" size={14} class="text-white/40 group-hover:text-fg" /></button>
							{:else}
								<span class="text-[13px] text-white/55">아직 안 냈어요</span>
							{/if}
							{#if t.overdue}<span class="mt-1 block"><Chip label="기한 지남" tone="red" /></span>{/if}
							{#if t.redoWhy && t.status === 'redo'}<p class="mt-1 text-[12px] text-danger-fg">요청 사유 · {t.redoWhy}</p>{/if}
						</td>
						<td class="py-3.5 text-[13px]">
							{#if t.submittedAt}<span class="block text-white/80">{t.submittedAt}</span>{/if}
							{#if t.waited}<span class="mt-0.5 block font-bold text-accent">{t.waited}</span>{:else if !t.submittedAt}<span class="text-white/55">기한 {t.due}</span>{/if}
						</td>
						<td class="py-3.5 pr-5">
							<span class="flex justify-end gap-1.5">{@render taxButtons(t, true)}</span>
							{#if t.blocked}<p class="mt-1.5 text-right text-[12px] leading-[1.45] font-semibold text-danger-fg">{t.blocked}</p>{:else if t.confirmNote}<p class="mt-1.5 text-right text-[12px] font-semibold {NOTE_CLS[t.confirmNoteTone]}">{t.confirmNote}</p>{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="py-14 text-center text-[14px] text-white/55">{EMPTY[tab]}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- 모바일 카드 -->
	<ul class="mt-4 flex flex-col gap-2 lg:hidden">
		{#each rows as t (t.id)}
			<li class="rounded-[20px] border border-white/8 bg-white/3 p-4">
				<button type="button" onclick={() => openRow(t.id)} class="flex w-full items-start gap-3 text-left">
					<Avatar initial={t.initial} bg={t.avatarBg} size={40} />
					<span class="min-w-0 flex-1">
						<span class="flex items-baseline justify-between gap-2"><span class="truncate text-[15px] font-bold">{t.name} · {t.firm}</span><span class="text-[16px] font-extrabold tabular-nums">{won(t.total)}</span></span>
						<span class="mt-1 flex flex-wrap items-center gap-1">
							{#if t.waited}<span class="text-[12px] font-bold text-accent">{t.waited}</span>{/if}
							{#if t.overdue}<Chip label="기한 지남" tone="red" />{/if}
							{#each t.payChips as pc (pc.label)}<Chip label={pc.label} tone={pc.tone} />{/each}
						</span>
						{#if t.approvalNo}<span class="mt-1.5 block font-mono text-[12px] text-white/70">{t.approvalNo}</span>{/if}
						{#if t.blocked}<span class="mt-1.5 block text-[12px] leading-[1.5] font-semibold text-danger-fg">{t.blocked}</span>{:else if t.confirmNote}<span class="mt-1.5 block text-[12px] font-semibold {NOTE_CLS[t.confirmNoteTone]}">{t.confirmNote}</span>{/if}
						{#if t.redoWhy && t.status === 'redo'}<span class="mt-1 block text-[12px] text-danger-fg">요청 사유 · {t.redoWhy}</span>{/if}
					</span>
				</button>
				{#if t.actions.length}<div class="mt-3 flex gap-2 border-t border-white/6 pt-3">{@render taxButtons(t, true, true)}</div>{/if}
			</li>
		{:else}
			<li class="rounded-[20px] border border-white/8 bg-white/3 px-4 py-12 text-center text-[14px] text-white/55">{EMPTY[tab]}</li>
		{/each}
	</ul>
</div>

{#if open}
	<Drawer title="{open.name} · {open.month} 세금계산서" onclose={() => closeDrawer(page.url)}>
		{#snippet head()}
			<div class="flex items-center gap-3">
				<Avatar initial={open.initial} bg={open.avatarBg} size={44} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-[17px] font-extrabold">{open.name} · {open.firm}</p>
					<p class="truncate text-[13px] text-white/55">{open.handle} · {open.month}</p>
				</div>
			</div>
			<div class="mt-5 rounded-3xl bg-white/4 p-5">
				<div class="flex flex-wrap gap-1.5"><Chip label={open.chip.label} tone={open.chip.tone} lg />{#if open.overdue}<Chip label="기한 지남" tone="red" lg />{/if}</div>
				<p class="mt-3 text-[30px] font-extrabold tracking-[-0.03em] tabular-nums">{won(open.total)}</p>
				<p class="mt-1 text-[13px] text-white/60">지급 건 · {#each open.payChips as pc, i (pc.label)}{i ? ' · ' : ''}<span class={NOTE_CLS[pc.tone]}>{pc.label}</span>{/each}</p>
				{#if open.blocked}<p class="mt-2 text-[13px] leading-[1.55] font-semibold text-danger-fg">{open.blocked}</p>{:else if open.confirmNote}<p class="mt-2 text-[13px] font-semibold {NOTE_CLS[open.confirmNoteTone]}">{open.confirmNote}</p>{/if}
				{#if open.redoWhy && open.status === 'redo'}<p class="mt-2 text-[13px] text-danger-fg">다시 제출 요청 사유 · {open.redoWhy}</p>{/if}
			</div>
		{/snippet}

		<Section title="홈택스에서 대조할 값">
			{#snippet aside()}<a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-bold text-white/70 hover:text-fg">홈택스<Icon id="out" size={13} /></a>{/snippet}
			<div class="rounded-2xl border border-white/8 px-4 py-1">
				<KV k="공급자">{open.firm}</KV>
				<KV k="사업자등록번호">{@render bizNo(open)}</KV>
				<KV k="작성일자">{open.writeDate}</KV>
				<KV k="공급가액"><span class="tabular-nums">{won(open.supply)}</span></KV>
				<KV k="세액"><span class="tabular-nums">{won(open.vat)}</span></KV>
				<KV k="합계" strong><span class="tabular-nums">{won(open.total)}</span></KV>
				{#if open.sentTotal !== null}<KV k="낸 합계"><span class="text-danger-fg tabular-nums">{won(open.sentTotal)}</span></KV>{/if}
				<KV k="승인번호">
					{#if open.approvalNo}<button type="button" onclick={() => copy(open.approvalNo!)} class="inline-flex items-center gap-1.5 font-mono text-[13px]">{open.approvalNo}<Icon id="copy" size={14} class="text-white/45" /></button>{:else}<span class="text-white/55">아직 안 냈어요</span>{/if}
				</KV>
				<KV k="제출">{open.submittedAt ?? '—'}{#if open.waited} · <span class="text-accent">{open.waited}</span>{/if}</KV>
				<KV k="발행 기한">{open.due}</KV>
			</div>
			<p class="mt-2 px-1 text-[12px] leading-[1.55] text-white/55">합계 = 정산금 − 제조금액 상계 · 보증금 환급은 넣지 않아요 · 크리에이터 화면과 같은 숫자예요</p>
		</Section>

		<Section title="이력">
			{#if open.log.length}<Timeline items={open.log} />{:else}<p class="text-[13px] text-white/55">아직 기록이 없어요</p>{/if}
		</Section>

		{#snippet footer()}
			{#if open.actions.length}{@render taxButtons(open, false, true)}{:else}<p class="w-full py-2 text-center text-[13px] text-white/55">{open.status === 'ok' ? '지급이 끝나 되돌릴 수 없어요' : '크리에이터가 내기를 기다리고 있어요'}</p>{/if}
		{/snippet}
	</Drawer>
{/if}

{#if modal?.kind === 'confirm'}
	{@const t = modal.t}
	<Modal title="수취 확인" desc="{t.name} · {t.firm} · {t.month}" ok="수취 확인" info={t.confirmNote ?? ''} infoTone={t.confirmNoteTone} onclose={() => (modal = null)} onok={() => { app.showToast(server.confirmTax(t.id)); modal = null; }}>
		<div class="rounded-2xl bg-white/4 px-4 py-1">
			<KV k="합계" strong><span class="text-accent tabular-nums">{won(t.total)}</span></KV>
			<KV k="공급가액 · 세액"><span class="tabular-nums">{won(t.supply)} · {won(t.vat)}</span></KV>
			<KV k="작성일자">{t.writeDate}</KV>
			<KV k="승인번호"><span class="font-mono text-[13px]">{t.approvalNo}</span></KV>
		</div>
	</Modal>
{:else if modal?.kind === 'redo'}
	{@const t = modal.t}
	<Modal title="다시 제출 요청" desc="{t.name} · {t.firm} · {t.month}" ok="다시 제출 요청" info="크리에이터 정산 화면에 사유와 함께 보여요{t.status === 'ok' ? ' · 확인 완료를 되돌려 지급 보류로 바뀌어요' : ''}" disabled={!why.trim()} onclose={() => (modal = null)} onok={() => { app.showToast(server.redoTax(t.id, why.trim())); modal = null; }}>
		<Field label="사유(필수)" count="{why.length}/100">
			<textarea bind:value={why} maxlength="100" rows="3" class={TEXTAREA} placeholder={t.blocked ? '예: 정산 뒤 환불로 합계가 바뀌었어요 — 새 합계로 다시 발행해 주세요' : '예: 승인번호가 홈택스에서 조회되지 않아요'}></textarea>
		</Field>
	</Modal>
{/if}
