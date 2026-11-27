<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { won } from '$lib/format';
	import { FAIL_META, server } from '$lib/mock/server.svelte';
	import type { FailKind, PayoutView } from '$lib/mock/types';
	import { payModal } from '$lib/pay-modal.svelte';
	import { app } from '$lib/state.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import { setParams } from '$lib/url';
	import Avatar from '$lib/components/Avatar.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import PayoutButtons from '$lib/components/PayoutButtons.svelte';
	import SubFilter from '$lib/components/SubFilter.svelte';

	/** 지급 — docs/myr-admin-screens.md §11. 자동 이체(영업일 오후 1시) 기준이라 이 화면의 일은 "보내기"가 아니라 막힌 것 · 예외 처리.
	 *  머리(요약 · 다음 자동 이체 · 토스 잔액 · 마지막 실행) → 탭(실패가 있으면 기본 · 종류별 하위 필터) → 표(PC) / 카드(모바일) → 줄을 누르면 지급 건 상세 페이지(/payouts/<id> · 2026-11-27 서랍 대신).
	 *  상태 칩 · 안내 · 버튼 · 건수는 서버(목) 값 — 화면은 탭 소속(tabs) · 실패 종류(failKind) · 보류 이유(holdKinds)로 거르기만 한다 */
	const meta = $derived(server.payoutTabs());
	const all = $derived(server.payouts);
	const sch = $derived(server.schedule);
	const ms = $derived(server.monthSummary);
	const prov = $derived(server.provider);

	const tab = $derived(page.url.searchParams.get('tab') ?? meta.defaultTab);
	const sub = $derived(page.url.searchParams.get('sub') ?? '');

	const rows = $derived(
		all.filter((p) => {
			if (tab !== 'all' && !p.tabs.includes(tab as PayoutView['tabs'][number])) return false;
			if (!sub) return true;
			return tab === 'fail' ? p.failKind === sub : p.holdKinds.includes(sub as PayoutView['holdKinds'][number]);
		})
	);
	const subs = $derived(tab === 'fail' ? meta.subs.fail : tab === 'hold' ? meta.subs.hold : null);
	const tabCount = $derived(meta.tabs.find((t) => t.id === tab)?.count ?? 0);

	const EMPTY: Record<string, string> = {
		fail: '실패한 지급 건이 없어요',
		hold: '보류된 지급 건이 없어요',
		ready: '지급 대기 건이 없어요 — 세금계산서가 확인되면 여기 나와요',
		sending: '송금 중인 건이 없어요',
		paid: '아직 지급 완료된 건이 없어요',
		none: '지급 없음 건이 없어요',
		all: '지급 건이 없어요'
	};

	// 여러 줄 선택 — 아래 고정 바(§11-1). 탭이 바뀌면 비운다
	let picked = $state<string[]>([]);
	$effect(() => {
		void tab;
		void sub;
		picked = [];
	});
	const sel = $derived(server.selection(picked));
	const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
	const allOn = $derived(rows.length > 0 && rows.every((r) => picked.includes(r.id)));

	let moreOpen = $state(false);
	const openRow = (id: string) => goto(`/payouts/${id}`);

	// 예전 서랍 주소(?id=) — 상세 페이지로 넘긴다
	onMount(() => {
		const id = page.url.searchParams.get('id');
		if (id) goto(`/payouts/${encodeURIComponent(id)}`, { replaceState: true });
	});
</script>

<svelte:window onclick={() => (moreOpen = false)} />

<div class="animate-up-in px-5 pb-28 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-8 lg:pb-16">
	<PageHead title="지급">
		{#snippet sum()}
			{ms.month} · 지급 합계 <b class="font-bold text-fg tabular-nums">{ms.totalText}</b> · 자동 지급 완료 {ms.paidN}/{ms.n}건 · 실패 <span class={ms.failN ? 'font-bold text-danger-fg' : ''}>{ms.failN}</span> · 보류 {ms.holdN}
		{/snippet}
		{#snippet actions()}
			<label class="relative">
				<span class="sr-only">정산월</span>
				<select class="h-11 appearance-none rounded-xl border border-white/12 bg-transparent pr-9 pl-3.5 text-[14px] font-bold text-fg">
					<option>10월분</option>
					<option disabled>9월분 · 지급 끝</option>
				</select>
				<Icon id="down" size={16} class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-white/55" />
			</label>
			<div class="relative">
				<button
					type="button"
					onclick={(e) => {
						e.stopPropagation();
						moreOpen = !moreOpen;
					}}
					aria-expanded={moreOpen}
					aria-label="예외 처리 더보기"
					class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 text-white/80 hover:border-white/35"><Icon id="more" size={20} /></button
				>
				{#if moreOpen}
					<div class="absolute top-12 right-0 z-30 w-[260px] animate-fade-in rounded-2xl border border-white/10 bg-panel-2 p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.5)]" role="menu">
						<p class="px-3 pt-2 pb-1 text-[12px] font-bold text-white/55">예외 처리 — 지급대행 밖에서 처리할 때만</p>
						<button type="button" role="menuitem" onclick={() => payModal.show('record')} class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold hover:bg-white/6"><Icon id="check" size={17} />지급 완료 기록</button>
						<button type="button" role="menuitem" onclick={() => payModal.show('download')} class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold hover:bg-white/6"><Icon id="out" size={17} />이체용 내려받기</button>
					</div>
				{/if}
			</div>
		{/snippet}
	</PageHead>

	<!-- 다음 자동 이체 · 토스 잔액(지급 가능 · 정산 전) · 마지막 실행 (홈 ①과 같은 값 · 잔액은 운영 참고용으로 여기에만 항상) -->
	<div class="mt-5 grid gap-2 rounded-3xl border border-white/8 bg-panel p-2 sm:grid-cols-3">
		<a href="?tab=ready" class="rounded-2xl px-4 py-3 hover:bg-white/4" title={sch.rule}>
			<p class="flex items-center gap-1.5 text-[12px] text-white/60"><Icon id="clock" size={14} sw={2.2} />{sch.when}</p>
			<p class="mt-1 text-[17px] font-extrabold tabular-nums">{sch.n}건 · {sch.sumText}</p>
			{#if sch.deferN}<p class="mt-0.5 text-[12px] font-semibold text-accent">{sch.deferN}건은 토스 정산 뒤 다음 영업일</p>{/if}
		</a>
		<div class="flex items-center justify-between gap-2 rounded-2xl px-4 py-3">
			<div>
				<p class="text-[12px] text-white/60">토스 지급 가능</p>
				<p class="mt-1 text-[17px] font-extrabold tabular-nums">{sch.availableText}</p>
				<p class="mt-0.5 text-[12px] font-semibold text-white/55 tabular-nums">정산 전 {sch.pendingText}</p>
			</div>
			<button type="button" onclick={() => app.showToast(server.refreshBalance())} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/6 hover:text-fg" aria-label="토스 잔액 새로고침"><Icon id="refresh" size={17} /></button>
		</div>
		<div class="rounded-2xl px-4 py-3">
			<p class="text-[12px] text-white/60">마지막 실행</p>
			<p class="mt-1 text-[15px] font-bold tabular-nums">{prov.lastRun.at}</p>
			<p class="mt-0.5 text-[12px] font-semibold {sch.lastRunBad ? 'text-danger-fg' : 'text-white/55'}">{sch.lastRunText}</p>
		</div>
	</div>

	<div class="mt-6 flex flex-col gap-3">
		<FilterTabs tabs={meta.tabs} value={tab} label="지급 상태" onpick={(id) => setParams(page.url, { tab: id, sub: null })} />
		{#if subs}
			<SubFilter items={subs} total={tabCount} value={sub} onpick={(id) => setParams(page.url, { sub: id || null })} />
		{/if}
		{#if tab === 'fail' && sub}
			{@const f = FAIL_META[sub as FailKind]}
			<p class="rounded-2xl bg-white/4 px-4 py-3 text-[13px] leading-[1.55] text-white/70"><b class="font-bold {NOTE_CLS[f.tone]}">{f.label}</b> — {f.what} · {f.auto}</p>
		{/if}
	</div>

	<!-- PC 표 — 한 줄 52px · 열 제목 -->
	<div class="mt-4 hidden overflow-hidden rounded-3xl border border-white/8 bg-white/3 lg:block">
		<table class="w-full table-fixed text-left text-[14px]">
			<thead class="border-b border-white/8 text-[12px] font-bold text-white/60">
				<tr class="h-11">
					<th class="w-12 pl-5"><input type="checkbox" checked={allOn} onchange={() => (picked = allOn ? [] : rows.map((r) => r.id))} aria-label="전체 선택" class="h-4 w-4 accent-[#ff7a3d]" /></th>
					<th class="w-[190px]">크리에이터</th>
					<th class="w-[110px] text-right">금액</th>
					<th class="w-[190px] pl-6">상태</th>
					<th>안내</th>
					<th class="w-[130px]">계좌</th>
					<th class="w-[250px] pr-5 text-right">처리</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as p (p.id)}
					<tr onclick={() => openRow(p.id)} class="h-[60px] cursor-pointer border-b border-white/6 transition-colors last:border-b-0 hover:bg-white/4">
						<td class="pl-5" onclick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.includes(p.id)} onchange={() => toggle(p.id)} aria-label="{p.name} 선택" class="h-4 w-4 accent-[#ff7a3d]" /></td>
						<td>
							<span class="flex items-center gap-2.5">
								<Avatar initial={p.initial} bg={p.avatarBg} size={32} />
								<span class="min-w-0"><span class="block truncate font-bold">{p.name}</span><span class="block truncate text-[12px] text-white/55">{p.handle} · {p.linesText}</span></span>
							</span>
						</td>
						<td class="text-right font-extrabold tabular-nums">{won(p.amount)}</td>
						<td class="pl-6"><span class="flex flex-wrap gap-1">{#each p.chips as c (c.label)}<Chip label={c.label} tone={c.tone} dot={c.label === '송금 중'} />{/each}</span></td>
						<td class="pr-4">
							{#if p.holdText}<p class="truncate text-[13px] font-semibold text-white/80" title={p.holdText}>{p.holdText}</p>{/if}
							{#if p.note}<p class="line-clamp-2 text-[12px] leading-[1.45] {NOTE_CLS[p.noteTone]}" title={p.note}>{p.note}</p>{/if}
						</td>
						<td class="text-[13px] text-white/70 tabular-nums">{p.account}</td>
						<td class="pr-5"><span class="flex justify-end gap-1.5"><PayoutButtons {p} sm max={2} /></span></td>
					</tr>
				{:else}
					<tr><td colspan="7" class="py-14 text-center text-[14px] text-white/55">{EMPTY[tab]}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- 모바일 카드 -->
	<ul class="mt-4 flex flex-col gap-2 lg:hidden">
		{#each rows as p (p.id)}
			<li class="rounded-[20px] border bg-white/3 p-4 {picked.includes(p.id) ? 'border-accent/50' : 'border-white/8'}">
				<button type="button" onclick={() => openRow(p.id)} class="flex w-full items-start gap-3 text-left">
					<Avatar initial={p.initial} bg={p.avatarBg} size={40} />
					<span class="min-w-0 flex-1">
						<span class="flex items-baseline justify-between gap-2"><span class="truncate text-[15px] font-bold">{p.name}</span><span class="text-[16px] font-extrabold tabular-nums">{won(p.amount)}</span></span>
						<span class="mt-1 flex flex-wrap gap-1">{#each p.chips as c (c.label)}<Chip label={c.label} tone={c.tone} dot={c.label === '송금 중'} />{/each}</span>
						{#if p.holdText}<span class="mt-1.5 block text-[13px] font-semibold text-white/80">{p.holdText}</span>{/if}
						{#if p.note}<span class="mt-1 block text-[12px] leading-[1.5] {NOTE_CLS[p.noteTone]}">{p.note}</span>{/if}
					</span>
				</button>
				{#if p.actions.some((a) => a !== 'record')}
					<div class="mt-3 flex gap-2 border-t border-white/6 pt-3">
						<PayoutButtons {p} sm max={2} full />
					</div>
				{/if}
			</li>
		{:else}
			<li class="rounded-[20px] border border-white/8 bg-white/3 px-4 py-12 text-center text-[14px] text-white/55">{EMPTY[tab]}</li>
		{/each}
	</ul>
</div>

<!-- 여러 줄 선택 바 -->
{#if sel.n}
	<div class="fixed inset-x-0 bottom-[96px] z-30 mx-auto w-[calc(100%-40px)] max-w-[390px] animate-toast lg:bottom-8 lg:max-w-[720px]">
		<div class="flex items-center gap-2 rounded-2xl border border-white/12 bg-panel-2 py-2.5 pr-2.5 pl-4 shadow-[0_14px_40px_rgba(0,0,0,.55)]">
			<p class="min-w-0 flex-1 text-[14px] font-bold"><span class="text-accent tabular-nums">{sel.n}건</span> 선택 · <span class="tabular-nums">{sel.sumText}</span></p>
			<button type="button" onclick={() => (picked = [])} class="hidden h-10 px-2 text-[13px] font-semibold text-white/60 hover:text-fg sm:block">선택 해제</button>
			<Btn sm disabled={!sel.canHold} onclick={() => payModal.show('hold', picked)}>운영 보류</Btn>
			<Btn sm kind="primary" disabled={!sel.canResend} onclick={() => payModal.show('resend', picked)}>다시 보내기</Btn>
		</div>
		{#if !sel.canHold && !sel.canResend}<p class="mt-1.5 text-center text-[12px] text-white/60">운영 보류는 지급 대기 · 재시도 대기, 다시 보내기는 운영 조치 필요 건만 함께 처리할 수 있어요</p>{/if}
	</div>
{/if}

