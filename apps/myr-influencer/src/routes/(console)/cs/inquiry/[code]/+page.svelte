<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { csFailMessage } from '@sellery/myr-core/cs-rules';
	import type { Me } from '$lib/data';
	import { answerOf, canAnswer, inqOrderText, inqShipping, inqStatus, inqTypeCls, inquiryGuide, inquiryTemplates, isWaiting, questionOf } from '$lib/inquiry';
	import { goBack } from '$lib/nav';
	import { relativeTime } from '$lib/product-row';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Badge from '$lib/components/Badge.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import SectionTitle from '$lib/components/SectionTitle.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 고객 문의 상세(시안 INQUIRY DETAIL) — 상품 · 주문 · 배송(소유 확인된 주문만 · 시안 밖 추가 2026-11-05) · 고객 질문 · 답변 기준 · 내 답변.
	 *  답변 대기면 자주 쓰는 답변 칩 + 입력 → [답변 등록하기](답변 완료 · 고객 답변 메일). 답변했으면 내 답변(읽기 전용 — 답변 수정은 없다 · 2026-11-05 대표 결정).
	 *  모바일: 한 줄로 쌓고 하단 버튼 줄 / PC(lg~): 왼쪽 정보 + 오른쪽 420px 고정 패널(답변 작성 · 답변 결과) — 교환·환불 상세와 같은 틀. */
	let { data } = $props();
	const t = $derived(data.thread);
	const c = $derived(t.conversation);
	const me = $derived(page.data.me as Me);
	const question = $derived(questionOf(t));
	const answer = $derived(answerOf(t));
	const waiting = $derived(isWaiting(c));
	const st = $derived(inqStatus(c));
	const guide = $derived(inquiryGuide(c.type));
	const chips = $derived(inquiryTemplates(c.type, me.name));
	const ago = $derived(relativeTime(c.createdAt));
	const answeredWhen = $derived(answer ? relativeTime(answer.createdAt) : '');
	/** 주문 · 배송 — 크리에이터는 출고 일정을 정하지 않으므로 지금 기록(상태 · 운송장 · 발송일)만 보고 답한다 */
	const ship = $derived(inqShipping(c));

	let draft = $state('');
	let saving = $state(false);
	const ok = $derived(canAnswer(draft) && !saving);

	async function submit() {
		if (!ok) return;
		saving = true;
		try {
			const res = await fetch(`/api/cs/${encodeURIComponent(c.code)}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: draft }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
			if (!r?.ok) {
				app.showToast(csFailMessage(r?.code ?? 'DB_ERROR'));
				return;
			}
			app.showToast('답변을 등록했어요 · 고객에게 알림이 갔어요');
			if (app.inqWaiting) app.inqWaiting -= 1;
			draft = '';
			await invalidateAll();
		} catch {
			app.showToast('보내지 못했어요. 인터넷 연결을 확인해주세요');
		} finally {
			saving = false;
		}
	}
</script>

{#snippet productCard()}
	<div class="flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:gap-4 lg:p-[18px]">
		<Tile tile="slate" bg={c.product?.tile} iconId={c.product?.icon} thumbUrl={c.product?.thumbUrl} icon={36} iconCls="lg:h-11 lg:w-11" class="h-16 w-16 rounded-2xl lg:h-20 lg:w-20 lg:rounded-[18px]" />
		<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
			<span class="text-[15px] leading-[1.3] font-bold lg:text-[17px]">{c.product?.name ?? '상품'}</span>
			<span class="text-[12px] text-white/55 lg:text-[13px]">{inqOrderText(c)}</span>
		</span>
	</div>
{/snippet}

{#snippet shipping()}
	{#if ship}
		<SectionTitle>주문 · 배송</SectionTitle>
		<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
			<div class="flex items-center justify-between gap-2">
				<span class="text-[14px] font-bold lg:text-[15px]">{inqOrderText(c)}</span>
				<span class="rounded-lg px-2.5 py-[5px] text-[12px] font-bold whitespace-nowrap lg:text-[13px] {ship.cls}">{ship.label}</span>
			</div>
			<dl class="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3 text-[13px] lg:text-[14px]">
				{#each ship.rows as r (r.k)}
					<div class="flex justify-between gap-4">
						<dt class="shrink-0 text-white/55">{r.k}</dt>
						<dd class="min-w-0 text-right font-semibold text-fg">
							{#if r.href}<a href={r.href} target="_blank" rel="noopener noreferrer" class="underline decoration-white/30 underline-offset-2 hover:text-accent">{r.v}</a>{:else}{r.v}{/if}
						</dd>
					</div>
				{/each}
			</dl>
		</div>
	{:else if c.type === '배송 문의'}
		<p class="mt-3 rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-[13px] leading-normal text-white/60">주문번호 없이 남긴 문의라 배송 상태를 확인할 수 없어요.</p>
	{/if}
{/snippet}

{#snippet questionCard()}
	<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
		<div class="flex items-center gap-2.5 lg:gap-3">
			<span class="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/8 text-[12px] font-extrabold lg:h-10 lg:w-10 lg:text-[14px]" aria-hidden="true">{c.buyerName.trim()[0] ?? '고'}</span>
			<span>
				<span class="block text-[14px] font-bold lg:text-[15px]">{c.buyerName}</span>
				<span class="block text-[12px] text-white/50 lg:text-[13px]">{ago} 문의</span>
			</span>
			<span class="ml-auto hidden items-center gap-2 lg:flex">
				<span class="text-[12px] text-white/50">유형</span>
				<span class="rounded-lg bg-white/6 px-2.5 py-[5px] text-[13px] font-bold">{c.type}</span>
			</span>
		</div>
		<p class="mt-3 text-[14px] leading-[1.65] text-pretty whitespace-pre-line text-white/85 lg:mt-4 lg:text-[15px] lg:leading-[1.7]">"{question}"</p>
	</div>
{/snippet}

{#snippet answerCard()}
	{#if answer}
		<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
			<div class="flex items-center gap-2.5">
				<span class="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-extrabold text-bg lg:h-10 lg:w-10" style:background={me.avatarBg} aria-hidden="true">{me.initial}</span>
				<span>
					<span class="block text-[14px] font-bold lg:text-[15px]">{answer.actorRole === 'admin' ? `${me.name} (운영팀 대행)` : me.name}</span>
					<span class="block text-[12px] text-white/50 lg:text-[13px]">{answeredWhen} 답변</span>
				</span>
			</div>
			<p class="mt-3 text-[14px] leading-[1.7] text-pretty whitespace-pre-line text-white/85 lg:mt-4 lg:text-[15px]">{answer.body}</p>
		</div>
	{/if}
{/snippet}

{#snippet guideBox()}
	<ul class="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/7 px-4 py-3.5 text-[13px] leading-normal text-white/80 lg:gap-2.5 lg:rounded-[20px] lg:px-5 lg:py-[18px] lg:text-[14px]">
		{#each guide as g (g)}
			<li class="flex items-start gap-2 lg:gap-2.5"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent lg:mt-2" aria-hidden="true"></span><span>{g}</span></li>
		{/each}
	</ul>
{/snippet}

{#snippet composer(rows: number)}
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each chips as rc (rc.name)}
			<button type="button" onclick={() => (draft = rc.text)} class="rounded-full border border-white/12 px-3 py-2 text-[12px] font-semibold text-white/80 transition-colors lg:hover:border-accent lg:hover:text-accent">{rc.name}</button>
		{/each}
	</div>
	<textarea class={TEXTAREA} {rows} bind:value={draft} maxlength="2000" aria-label="고객에게 보낼 답변" placeholder="{c.buyerName}님에게 보낼 답변을 적어주세요"></textarea>
{/snippet}

{#snippet actions(cls: string)}
	<button type="button" onclick={submit} disabled={!ok} aria-busy={saving} class="flex-1 rounded-2xl font-extrabold transition-colors duration-250 {ok ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'} {cls}">{saving ? '보내는 중…' : '답변 등록하기'}</button>
{/snippet}

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="고객 문의" fallback="/cs?view=inquiry">
		{#snippet right()}<span class="text-[12px] text-white/45">{ago}</span>{/snippet}
	</BackHeader>

	<!-- PC 제목 줄 -->
	<div class="hidden items-center gap-3 lg:flex">
		<PcBack onclick={() => goBack('/cs?view=inquiry')} />
		<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">{c.type}</h1>
		<span class="ml-auto flex items-center gap-2.5">
			<span class="rounded-lg px-3 py-1.5 text-[13px] font-bold {st.cls}">{st.label}</span>
			<span class="text-[13px] text-white/45">{c.buyerName} · {ago}</span>
		</span>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-8 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
		<div>
			<div class="flex items-center gap-2 lg:hidden">
				<Badge cls={inqTypeCls(c.type)} lg>{c.type}</Badge>
				<Badge cls={st.cls} lg strong={false}>{st.label}</Badge>
			</div>
			<div class="mt-4 lg:mt-0">{@render productCard()}</div>
			{@render shipping()}

			<SectionTitle>고객 질문</SectionTitle>
			{@render questionCard()}

			<!-- 모바일: 답변 기준 → 내 답변 · 입력 / PC: 내 답변 → 답변 기준(입력은 오른쪽 패널) -->
			<div class="lg:hidden">
				<SectionTitle>답변 기준</SectionTitle>
				{@render guideBox()}
				{#if answer && !waiting}
					<SectionTitle>내 답변</SectionTitle>
					{@render answerCard()}
				{/if}
				{#if waiting}
					<SectionTitle>고객에게 보낼 답변</SectionTitle>
					{@render composer(5)}
				{/if}
			</div>
			<div class="hidden lg:block">
				{#if answer && !waiting}
					<SectionTitle>내 답변</SectionTitle>
					{@render answerCard()}
				{/if}
				<SectionTitle>답변 기준</SectionTitle>
				{@render guideBox()}
			</div>
		</div>

		<!-- PC 오른쪽 고정 패널 -->
		<aside class="sticky top-8 hidden rounded-3xl border border-white/8 bg-panel p-6 lg:block">
			{#if waiting}
				<p class="text-[16px] font-extrabold">답변 작성</p>
				<p class="mt-1.5 mb-4 text-[13px] text-white/50">자주 쓰는 문구를 눌러 시작하고, 내 말투로 다듬어 보세요.</p>
				{@render composer(7)}
				<div class="mt-4 flex gap-2.5">{@render actions('h-[54px] text-[15px]')}</div>
			{:else}
				<p class="text-[16px] font-extrabold">답변 결과</p>
				<dl class="mt-3.5 flex flex-col gap-2.5 text-[14px]">
					<div class="flex justify-between text-white/60"><dt>답변 시각</dt><dd class="font-semibold text-fg">{answeredWhen}</dd></div>
					<div class="flex justify-between text-white/60"><dt>고객이 보는 곳</dt><dd class="font-semibold text-fg">MYR 마이 › 내 문의</dd></div>
					<div class="flex justify-between text-white/60"><dt>고객 알림</dt><dd class="font-semibold text-fg">답변 메일</dd></div>
					<div class="mt-1 flex items-baseline justify-between border-t border-white/8 pt-3"><dt class="font-bold">상태</dt><dd class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold {st.cls}">{st.label}</dd></div>
				</dl>
				<div class="mt-5 flex gap-2.5">
					<button type="button" onclick={() => goBack('/cs?view=inquiry')} class="h-[54px] flex-1 rounded-2xl bg-accent text-[15px] font-extrabold text-bg">목록으로</button>
				</div>
			{/if}
		</aside>
	</div>

	{#if waiting}
		<BottomBar>{@render actions('h-14 text-[16px]')}</BottomBar>
	{/if}
</div>
