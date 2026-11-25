<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { talk, type TalkTab } from '$lib/mock/talk.svelte';
	import { app } from '$lib/state.svelte';
	import { setParams } from '$lib/url';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';

	/** 파트너팀 톡 — docs/myr-admin-screens.md §7-2(0125). 크리에이터 ↔ 운영 대화방 · 크리에이터마다 방 하나 · 글만 · 실시간 아님.
	 *  PC: 왼쪽 대화방 목록(탭 답할 차례 · 전체) + 오른쪽 대화 — 고른 방이 없으면 목록 첫 방을 연다(주소는 그대로).
	 *  모바일: 목록 → 방을 누르면 하단 탭까지 덮는 전체 화면 대화([뒤로] · [크리에이터] · [↑]).
	 *  탭은 ?tab= · 고른 방은 ?cr=(크리에이터 id · 크리에이터 상세 [파트너팀 톡 열기]가 /talk?cr=c7 로 온다 · 방을 고를 때만 기록을 쌓아 뒤로가기로 닫힌다).
	 *  줄 · 말풍선 묶음 · 칩 · 안내 · 거절 문구는 서버(목) 값 — 화면은 그린다 */
	const tabs = $derived(talk.tabs());
	const cr = $derived(page.url.searchParams.get('cr'));
	const crConv = $derived(cr ? talk.room(cr) : null);
	// 크리에이터 상세에서 운영이 답한 방으로 들어오면 전체 탭에서 보인다
	const tab = $derived((page.url.searchParams.get('tab') as TalkTab | null) ?? (crConv && !crConv.waiting ? 'all' : 'wait'));
	const rows = $derived(talk.rooms(tab));
	/** PC 에서 오른쪽에 열린 방 — 주소의 cr, 없으면 목록 첫 방 */
	const selId = $derived(cr ?? talk.firstRoomId(tab));
	const conv = $derived(cr ? crConv : selId ? talk.room(selId) : null);

	// 열면 운영 읽음(공용) — 주소로 고른 방만. 자동으로 연 첫 방은 누르기 전까지 안 읽은 수가 남는다
	$effect(() => {
		if (cr) talk.open(cr);
	});

	let pushed = $state(false);
	function pick(id: string) {
		pushed = true;
		setParams(page.url, { cr: id }, true);
	}
	function back() {
		if (pushed) {
			pushed = false;
			history.back();
		} else setParams(page.url, { cr: null });
	}
	function pickTab(id: TalkTab) {
		pushed = false;
		setParams(page.url, { tab: id, cr: null });
	}

	// 답장 입력 — 1~2,000자 · Enter 보내기 · Shift+Enter 줄바꿈(한글 조합 중 Enter 는 무시)
	let draft = $state('');
	let err = $state('');
	$effect(() => {
		void selId;
		draft = '';
		err = '';
	});
	const lines = $derived(Math.min(5, Math.max(1, draft.split('\n').length)));
	const count = $derived(`${draft.length.toLocaleString('ko-KR')}/2,000`);
	const ready = $derived(draft.trim().length > 0);

	function send() {
		if (!selId) return;
		const r = talk.send(selId, draft);
		if (!r.ok) {
			err = r.msg;
			return;
		}
		draft = '';
		err = '';
		app.showToast(r.msg);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}

	// 열 때 · 보낼 때 맨 아래로
	let pcScroll: HTMLElement | undefined = $state();
	let moScroll: HTMLElement | undefined = $state();
	$effect(() => {
		void selId;
		void conv?.msgs.length;
		const a = pcScroll;
		const b = moScroll;
		tick().then(() => {
			a?.scrollTo(0, a.scrollHeight);
			b?.scrollTo(0, b.scrollHeight);
		});
	});
</script>

{#snippet waitChip()}
	<span class="shrink-0 rounded-md bg-accent/14 px-[7px] py-[3px] text-[11px] font-extrabold text-[#ff9a66]">답할 차례</span>
{/snippet}

{#snippet tabsEl()}
	{#each tabs as t (t.id)}
		{@const on = tab === t.id}
		<button
			type="button"
			aria-pressed={on}
			onclick={() => pickTab(t.id)}
			class="flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-bold whitespace-nowrap transition-colors {on ? 'border-accent bg-accent text-bg' : 'border-white/10 text-white/80 hover:border-white/30'}"
		>
			{t.name}<span class="rounded-full px-[7px] py-px text-[11px] font-extrabold tabular-nums {on ? 'bg-bg/18 text-bg' : 'bg-white/8 text-white/70'}">{t.count}</span>
		</button>
	{/each}
{/snippet}

{#snippet rowsEl()}
	{#each rows as r (r.id)}
		<button
			type="button"
			onclick={() => pick(r.id)}
			aria-current={r.id === cr ? 'true' : undefined}
			class="flex w-full items-start gap-3 border-t border-white/6 px-4 py-3.5 text-left transition-colors hover:bg-white/5 {r.id === selId ? 'lg:bg-white/6' : ''}"
		>
			<Avatar initial={r.initial} bg={r.avatarBg} size={44} />
			<span class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="flex min-w-0 items-center gap-1.5">
					<span class="min-w-0 truncate text-[15px] font-bold">{r.name}</span>
					<span class="shrink-0 text-[12px] text-white/55">{r.handle}</span>
					<span class="ml-auto shrink-0 text-[12px] text-white/55 tabular-nums">{r.time}</span>
				</span>
				<span class="truncate text-[13px] leading-[1.45] text-white/65">{r.preview}</span>
				<span class="flex min-h-5 items-center gap-1.5">
					{#if r.waiting}
						{@render waitChip()}<span class="text-[12px] text-white/55 tabular-nums">{r.wait}</span>
					{:else}
						<span class="text-[12px] text-white/55">운영이 답했어요</span>
					{/if}
					{#if r.unread}
						<span class="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-[5px] text-[11px] font-extrabold text-bg tabular-nums" aria-label="안 읽은 메시지 {r.unread}">{r.unread}</span>
					{/if}
				</span>
			</span>
		</button>
	{:else}
		<p class="border-t border-white/6 px-5 py-16 text-center text-[14px] text-white/55">{talk.empty(tab)}</p>
	{/each}
{/snippet}

{#snippet bubbles(mobile: boolean)}
	{#if conv}
		{#if !conv.hasMsgs}
			<p class="px-3 py-14 text-center text-[14px] leading-[1.6] text-white/55">아직 나눈 대화가 없어요<br />먼저 말을 걸면 크리에이터 콘솔 톡에 보여요</p>
		{/if}
		{#each conv.msgs as m (m.key)}
			{#if m.isDay}
				<div class="flex justify-center {m.top ? 'pt-1' : 'pt-[18px]'}"><span class="rounded-full bg-white/6 px-3 py-[5px] text-[11.5px] font-semibold text-white/60">{m.day}</span></div>
			{/if}
			{#if m.mine}
				<div class="flex animate-up-in flex-col items-end gap-1 {m.first ? 'mt-3.5' : 'mt-1'}">
					<div class="rounded-[18px_18px_6px_18px] bg-accent px-3.5 py-2.5 text-[14.5px] leading-[1.55] font-medium wrap-break-word whitespace-pre-wrap text-bg {mobile ? 'max-w-[78%]' : 'max-w-[min(520px,72%)]'}">{m.text}</div>
					<span class="text-[11px] whitespace-nowrap text-white/55 tabular-nums">{m.by}</span>
				</div>
			{:else}
				<div class="flex animate-up-in gap-2.5 {m.first ? 'mt-3.5' : 'mt-1'}">
					<span class="w-8 shrink-0 {m.first ? '' : 'invisible'}"><Avatar initial={conv.initial} bg={conv.avatarBg} size={32} /></span>
					<div class="flex min-w-0 flex-col items-start gap-[5px] {mobile ? 'max-w-[78%]' : 'max-w-[min(520px,72%)]'}">
						{#if m.showName}<span class="text-[12px] font-bold text-white/60">{conv.name}</span>{/if}
						<div class="rounded-[6px_18px_18px_18px] bg-white/7 px-3.5 py-2.5 text-[14.5px] leading-[1.55] wrap-break-word whitespace-pre-wrap text-fg">{m.text}</div>
					</div>
					<span class="shrink-0 self-end pb-0.5 text-[11px] whitespace-nowrap text-white/55 tabular-nums">{m.time}</span>
				</div>
			{/if}
		{/each}
	{/if}
{/snippet}

{#snippet composer(mobile: boolean)}
	<div class="shrink-0 border-t border-white/7 {mobile ? 'bg-bg px-3 pt-2.5 pb-[max(1.375rem,env(safe-area-inset-bottom))]' : 'px-[18px] pt-3.5 pb-3'}">
		<div class="flex items-end gap-2">
			<div class="min-w-0 flex-1 rounded-2xl border-[1.5px] border-white/10 bg-white/4 px-3.5 transition-colors focus-within:border-accent {mobile ? 'py-2.5' : 'py-3'}">
				<textarea
					bind:value={draft}
					oninput={() => (err = '')}
					onkeydown={key}
					rows={lines}
					maxlength="2000"
					aria-label="크리에이터에게 보낼 답장"
					placeholder="답장을 적어 주세요"
					class="no-bar block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[22px] text-fg outline-none"
				></textarea>
			</div>
			{#if mobile}
				<button type="button" onclick={send} aria-label="보내기" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors {ready ? 'bg-accent text-bg' : 'bg-white/8 text-white/45'}">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
				</button>
			{:else}
				<button type="button" onclick={send} class="h-12 shrink-0 rounded-[14px] px-[18px] text-[14.5px] font-extrabold transition-colors {ready ? 'bg-accent text-bg' : 'bg-white/8 text-white/45'}">보내기</button>
			{/if}
		</div>
		{#if err}<p class="mt-2 ml-0.5 text-[12.5px] font-semibold text-danger-fg" role="alert">{err}</p>{/if}
		<div class="mx-0.5 flex justify-between gap-3 text-[11.5px] text-white/55 {mobile ? 'mt-1.5' : 'mt-2'}">
			<span>{mobile ? '크리에이터에게는 MYR 파트너팀 이름으로 보여요' : '크리에이터에게는 MYR 파트너팀 이름으로 보여요 · Enter로 보내고, Shift + Enter로 줄을 바꿔요'}</span>
			<span class="shrink-0 tabular-nums">{count}</span>
		</div>
	</div>
{/snippet}

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<PageHead title="파트너팀 톡">
		{#snippet sum()}<span class="lg:hidden">{talk.sum}</span>{/snippet}
		{#snippet actions()}<span class="hidden text-[14px] text-white/55 tabular-nums lg:block">{talk.sum}</span>{/snippet}
	</PageHead>

	<!-- PC — 왼쪽 대화방 목록 · 오른쪽 대화 -->
	<div class="mt-5 hidden min-h-[560px] gap-4 lg:grid lg:h-[calc(100dvh-72px-108px)] lg:grid-cols-[380px_minmax(0,1fr)]">
		<div class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/3">
			<div class="flex shrink-0 gap-2 px-3.5 pt-3.5 pb-3" role="group" aria-label="대화방 상태">{@render tabsEl()}</div>
			<div class="no-bar min-h-0 flex-1 overflow-y-auto">{@render rowsEl()}</div>
		</div>
		<div class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/3">
			{#if conv}
				<div class="flex shrink-0 items-center gap-3 border-b border-white/7 px-5 py-3.5">
					<Avatar initial={conv.initial} bg={conv.avatarBg} size={40} />
					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-center gap-2">
							<span class="min-w-0 truncate text-[16px] font-extrabold">{conv.name}</span>
							<span class="shrink-0 text-[13px] text-white/55">{conv.handle}</span>
							{#if conv.waiting}{@render waitChip()}{/if}
						</div>
						<p class="mt-0.5 text-[12.5px] text-white/55">{conv.sub}</p>
					</div>
					<a href="/creators?id={conv.id}" class="flex h-10 shrink-0 items-center rounded-xl border border-white/16 px-3 text-[13px] font-bold whitespace-nowrap text-white/85 transition-colors hover:border-white/40 hover:text-fg">크리에이터 열기</a>
				</div>
				<div bind:this={pcScroll} class="no-bar min-h-0 flex-1 overflow-y-auto px-6 pt-[18px] pb-4">{@render bubbles(false)}</div>
				{@render composer(false)}
			{:else}
				<div class="flex flex-1 items-center justify-center text-[15px] text-white/55">대화를 골라 주세요</div>
			{/if}
		</div>
	</div>

	<!-- 모바일 — 대화방 목록 -->
	<div class="lg:hidden">
		<div class="mt-3.5 flex gap-2" role="group" aria-label="대화방 상태">{@render tabsEl()}</div>
		<div class="mt-3.5 overflow-hidden rounded-[20px] border border-white/8 bg-white/3"><div class="-mt-px">{@render rowsEl()}</div></div>
	</div>
</div>

<!-- 모바일 — 대화(하단 탭까지 덮는 전체 화면) -->
{#if cr}
	<div class="fixed inset-0 z-40 mx-auto flex max-w-[430px] animate-drawer flex-col bg-bg lg:hidden" role="dialog" aria-modal="true" aria-label={conv ? `${conv.name} 대화` : '대화'}>
		<div class="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/7 px-4">
			<button type="button" onclick={back} aria-label="뒤로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 text-fg"><Icon id="back" size={18} sw={2.2} /></button>
			{#if conv}
				<Avatar initial={conv.initial} bg={conv.avatarBg} size={36} />
				<div class="min-w-0 flex-1">
					<div class="flex min-w-0 items-center gap-1.5">
						<span class="min-w-0 truncate text-[15px] font-extrabold">{conv.name}</span>
						{#if conv.waiting}{@render waitChip()}{/if}
					</div>
					<p class="mt-px truncate text-[11.5px] text-white/55">{conv.handle} · {conv.sub}</p>
				</div>
				<a href="/creators?id={conv.id}" class="flex h-9 shrink-0 items-center rounded-[11px] border border-white/16 px-2.5 text-[12.5px] font-bold whitespace-nowrap text-white/85">크리에이터</a>
			{/if}
		</div>
		{#if conv}
			<div bind:this={moScroll} class="no-bar min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3">{@render bubbles(true)}</div>
			{@render composer(true)}
		{:else}
			<p class="flex flex-1 items-center justify-center text-[14px] text-white/55">크리에이터를 찾을 수 없어요</p>
		{/if}
	</div>
{/if}
