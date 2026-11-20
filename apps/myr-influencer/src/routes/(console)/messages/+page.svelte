<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { PARTNER_BODY_MAX, partnerBodyOk, partnerFailMessage } from '@sellery/myr-core/partner-talk';
	import { goBack } from '$lib/nav';
	import { app } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PcBack from '$lib/components/PcBack.svelte';

	/**
	 * 파트너팀 톡(0125) — 크리에이터 ↔ MYR 운영 대화방(크리에이터마다 방 하나 · 셀러리 대화처럼 말풍선만 · 실시간 아님 — 열 때 · 보낼 때 새로 읽는다).
	 * 상단 메신저 아이콘 · "문의" 버튼에서 연다(분류 · 맥락 없음 — 2026-11-20 결정).
	 * 모바일: 화면 전체(머리말 · 대화 스크롤 · 아래 입력 줄) / PC(lg~): 가운데 760px 카드.
	 */
	let { data } = $props();

	let draft = $state('');
	let sending = $state(false);
	let scroller: HTMLElement | undefined = $state();

	const canSend = $derived(partnerBodyOk(draft) && !sending);

	const dayFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
	const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });
	const dayOf = (iso: string) => dayFmt.format(new Date(iso));
	const timeOf = (iso: string) => timeFmt.format(new Date(iso));

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

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void send();
		}
	}
</script>

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:w-full lg:max-w-[760px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="파트너팀 톡" fallback="/" />
	<div class="hidden items-center gap-3 lg:flex">
		<h1 class="text-[24px] font-extrabold tracking-[-0.02em]">파트너팀 톡</h1>
	</div>

	<section aria-label="파트너팀 대화" class="flex min-h-0 flex-1 flex-col lg:mt-5 lg:h-[calc(100dvh-72px-140px)] lg:flex-none lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/8 lg:bg-white/3">
		<p class="shrink-0 border-b border-white/7 px-5 pb-2.5 py-0 lg:py-2.5 text-[12px] leading-[1.5] text-white/50">MYR 파트너팀이 확인하고 답해요.</p>

		<div bind:this={scroller} class="no-bar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 lg:px-6">
			{#if data.messages.length === 0}
				<p class="m-auto text-center text-[15px] font-bold text-white/70">궁금한 점을 남겨 주세요</p>
			{/if}
			{#each data.messages as m, i (m.id)}
				{@const mine = m.sender === 'seller'}
				{#if i === 0 || dayOf(data.messages[i - 1].createdAt) !== dayOf(m.createdAt)}
					<p class="my-2 self-center rounded-full bg-white/6 px-3 py-1 text-[11.5px] font-semibold text-white/55">{dayOf(m.createdAt)}</p>
				{/if}
				<div class="flex max-w-[82%] flex-col gap-1 {mine ? 'items-end self-end' : 'items-start self-start'}">
					{#if !mine}<span class="pl-1 text-[11.5px] font-bold text-white/55">MYR 파트너팀</span>{/if}
					<div class="flex items-end gap-1.5 {mine ? 'flex-row-reverse' : ''}">
						<p class="rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.55] break-words whitespace-pre-wrap {mine ? 'rounded-br-md bg-accent text-bg' : 'rounded-bl-md bg-white/8 text-fg'}">{m.body}</p>
						<span class="shrink-0 pb-0.5 text-[10.5px] text-white/40 tabular-nums">{timeOf(m.createdAt)}</span>
					</div>
				</div>
			{/each}
		</div>

		<div class="shrink-0 border-t border-white/7 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:pb-4">
			<div class="flex items-end gap-2">
				<textarea
					bind:value={draft}
					{onkeydown}
					rows="2"
					maxlength={PARTNER_BODY_MAX}
					placeholder="메시지를 입력하세요"
					aria-label="파트너팀에 보낼 메시지"
					class="max-h-40 min-h-[48px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/4 px-3.5 py-3 text-[14px] leading-[1.5] text-fg placeholder:text-white/35 focus:border-white/30 focus:outline-none"
				></textarea>
				<button type="button" onclick={send} disabled={!canSend} aria-busy={sending} class="h-12 shrink-0 rounded-2xl px-4 text-[14px] font-extrabold transition-colors {canSend ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/40'}">{sending ? '보내는 중' : '보내기'}</button>
			</div>
		</div>
	</section>
</div>
