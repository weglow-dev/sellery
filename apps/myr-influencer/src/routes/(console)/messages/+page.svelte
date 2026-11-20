<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { PARTNER_BODY_MAX, partnerBodyOk, partnerFailMessage } from '@sellery/myr-core/partner-talk';
	import { goBack } from '$lib/nav';
	import { app } from '$lib/state.svelte';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * 파트너팀 톡(0125) — 크리에이터 ↔ MYR 운영 대화방(크리에이터마다 방 하나 · 셀러리 대화처럼 말풍선만 · 실시간 아님 — 열 때 · 보낼 때 새로 읽는다).
	 * 상단 메신저 아이콘 · "문의" 버튼에서 연다(분류 · 맥락 없음 — 2026-11-20 결정).
	 * 디자인 "MYR Influencer Admin" · "… PC" PARTNER TALK — 모바일: 60px 머리말(MYR 아바타) · 대화 스크롤 · 아래 입력 줄([↑]) /
	 * PC(lg~): h1 + 가운데 760px 카드(카드 머리말 · [보내기] · Enter 안내). 같은 사람이 이어 보낸 말풍선은 묶는다(아바타 · 이름은 첫 말풍선에만).
	 */
	let { data } = $props();

	let draft = $state('');
	let sending = $state(false);
	let scroller: HTMLElement | undefined = $state();

	const canSend = $derived(partnerBodyOk(draft) && !sending);
	const rows = $derived(Math.min(5, Math.max(1, draft.split('\n').length)));

	const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
	const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });
	const dayOf = (iso: string) => dayFmt.format(new Date(iso));
	const timeOf = (iso: string) => timeFmt.format(new Date(iso));

	/** 말풍선 줄 — 날이 바뀌면 날짜 칩 · 보낸 쪽이 바뀌거나 날이 바뀌면 새 묶음(위 14px · 아바타 · 이름), 이어지면 4px */
	const lines = $derived(
		data.messages.map((m, i, a) => {
			const day = dayOf(m.createdAt);
			const newDay = i === 0 || dayOf(a[i - 1].createdAt) !== day;
			return { m, mine: m.sender === 'seller', day: newDay ? day : null, first: newDay || a[i - 1].sender !== m.sender };
		})
	);

	async function toBottom() {
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight });
	}

	onMount(() => {
		app.talkUnread = 0; // 서버가 이 화면을 읽으며 읽음 표시했다
		void toBottom();
	});

	async function send() {
		if (!canSend) return;
		sending = true;
		try {
			const res = await fetch('/api/my/talk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: draft }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
			if (!r?.ok) {
				app.showToast(partnerFailMessage(r?.code));
				return;
			}
			draft = '';
			await invalidateAll();
			void toBottom();
		} catch {
			app.showToast('보내지 못했어요. 인터넷 연결을 확인해 주세요');
		} finally {
			sending = false;
		}
	}

	/** Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중 Enter 는 조합 확정만 */
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void send();
		}
	}
</script>

{#snippet avatar(cls: string)}
	<span class="flex shrink-0 items-center justify-center bg-accent/14 font-extrabold tracking-[0.02em] text-accent {cls}" aria-hidden="true">MYR</span>
{/snippet}

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:h-full lg:min-h-[600px] lg:w-full lg:max-w-[840px] lg:animate-up-in lg:px-10 lg:pt-7 lg:pb-8">
	<h1 class="hidden text-[32px] font-extrabold tracking-[-0.03em] lg:block">파트너팀 톡</h1>

	<section aria-label="파트너팀 대화" class="flex min-h-0 flex-1 flex-col lg:mt-5 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/8 lg:bg-white/3">
		<!-- 머리말 — 모바일: [뒤로] · 아바타 · 파트너팀 톡 / PC: 카드 머리말 · MYR 파트너팀 -->
		<div class="flex h-[60px] shrink-0 items-center gap-1.5 border-b border-white/7 pr-5 pl-1.5 lg:h-auto lg:gap-3 lg:px-[22px] lg:py-4">
			<button type="button" onclick={() => goBack('/')} aria-label="뒤로" class="flex h-11 w-11 shrink-0 items-center justify-center text-fg lg:hidden">
				<Icon id="back" size={22} sw={2.2} />
			</button>
			{@render avatar('size-9 rounded-xl text-[10px] lg:size-10 lg:rounded-[13px] lg:text-[11px]')}
			<div class="ml-1.5 min-w-0 lg:ml-0">
				<p class="text-[15px] font-extrabold"><span class="lg:hidden">파트너팀 톡</span><span class="hidden lg:inline">MYR 파트너팀</span></p>
				<p class="mt-px text-[11.5px] text-white/50 lg:mt-0.5 lg:text-[12.5px]">MYR 파트너팀이 확인하고 답해요.</p>
			</div>
		</div>

		<div bind:this={scroller} class="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-3 lg:px-6 lg:pt-5 lg:pb-4">
			{#if lines.length === 0}
				<p class="m-auto text-center text-[15px] font-bold text-white/70">궁금한 점을 남겨 주세요</p>
			{/if}
			{#each lines as { m, mine, day, first } (m.id)}
				{#if day}
					<div class="flex justify-center pt-1 pb-3.5">
						<span class="rounded-full bg-white/6 px-3 py-[5px] text-[11.5px] font-semibold text-white/60">{day}</span>
					</div>
				{/if}
				{#if mine}
					<div class="flex animate-[up-in_.25s_both] justify-end gap-2 {first ? 'mt-3.5' : 'mt-1'}">
						<span class="shrink-0 self-end pb-0.5 text-[11px] whitespace-nowrap text-white/40 tabular-nums">{timeOf(m.createdAt)}</span>
						<p class="max-w-[78%] rounded-[18px_18px_6px_18px] bg-accent px-3.5 py-2.5 text-[14.5px] leading-[1.55] font-medium break-words whitespace-pre-wrap text-bg lg:max-w-[min(520px,72%)]">{m.body}</p>
					</div>
				{:else}
					<div class="flex animate-[up-in_.25s_both] gap-2.5 {first ? 'mt-3.5' : 'mt-1'}">
						<span class="w-8 shrink-0 {first ? '' : 'invisible'}">{@render avatar('size-8 rounded-[10px] text-[9px]')}</span>
						<div class="flex max-w-[78%] min-w-0 flex-col items-start gap-[5px] lg:max-w-[min(520px,72%)]">
							{#if first}<span class="text-[12px] font-bold text-white/60">MYR 파트너팀</span>{/if}
							<p class="rounded-[6px_18px_18px_18px] bg-white/7 px-3.5 py-2.5 text-[14.5px] leading-[1.55] break-words whitespace-pre-wrap text-fg">{m.body}</p>
						</div>
						<span class="shrink-0 self-end pb-0.5 text-[11px] whitespace-nowrap text-white/40 tabular-nums">{timeOf(m.createdAt)}</span>
					</div>
				{/if}
			{/each}
			{#if data.waiting}
				<div class="flex items-center gap-3 px-1 pt-3.5 pb-1">
					<span class="h-px flex-1 bg-white/7"></span>
					<span class="text-[12px] text-white/50">파트너팀이 확인하고 답해 드릴게요</span>
					<span class="h-px flex-1 bg-white/7"></span>
				</div>
			{/if}
		</div>

		<div class="shrink-0 border-t border-white/7 bg-bg px-3 pt-2.5 pb-[max(22px,env(safe-area-inset-bottom))] lg:bg-transparent lg:px-[18px] lg:pt-3.5 lg:pb-3">
			<div class="flex items-end gap-2">
				<div class="min-w-0 flex-1 rounded-2xl border-[1.5px] border-white/10 bg-white/4 px-3.5 py-2.5 transition-colors focus-within:border-accent lg:py-3">
					<textarea
						bind:value={draft}
						{onkeydown}
						{rows}
						maxlength={PARTNER_BODY_MAX}
						placeholder="궁금한 점을 적어 주세요"
						aria-label="파트너팀에 보낼 메시지"
						class="block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[22px] text-fg outline-none placeholder:text-white/35"
					></textarea>
				</div>
				<button type="button" onclick={send} disabled={!canSend} aria-label="보내기" aria-busy={sending} class="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-[14.5px] font-extrabold transition-colors lg:h-12 lg:w-auto lg:px-[18px] {canSend ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">
					<span class="lg:hidden"><Icon id="up" size={20} sw={2.4} /></span>
					<span class="hidden lg:inline">보내기</span>
				</button>
			</div>
			<p class="mt-2 ml-0.5 hidden text-[11.5px] text-white/35 lg:block">Enter로 보내고, Shift + Enter로 줄을 바꿔요</p>
		</div>
	</section>
</div>
