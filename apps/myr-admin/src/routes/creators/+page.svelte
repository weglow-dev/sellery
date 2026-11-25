<script lang="ts">
	import { page } from '$app/state';
	import { won } from '$lib/format';
	import { server } from '$lib/mock/server.svelte';
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
	import InviteSend from '$lib/components/InviteSend.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KV from '$lib/components/KV.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import Section from '$lib/components/Section.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 크리에이터 — docs/myr-admin-screens.md §5-2 · §5-3 중 자동 이체에 필요한 부분(사업자 · 정산 정보 확인 · 지급 이력)만.
	 *  "계좌 확인 필요"로 이체가 실패하면 크리에이터가 계좌를 다시 입력 → 여기서 확인 → 다음 자동 이체(영업일 오후 1시)에 다시 보낸다.
	 *  [초대 보내기] = 보내기 폼만(§5-1 · 초대 목록은 필요해지면). 정지 = 정지 탭 · 이름 옆 칩 · 서랍 [계정 정지]/[정지 해제](§5-3 · UI 만 — 확인하면 "다음 단계" 안내). 상품 · 활동 탭은 다음 단계. 상태 칩 · 지급 안내 · 결과 문구는 서버(목) 값 */
	const tabs = $derived(server.creatorTabs());
	const all = $derived(server.creators);
	const tab = $derived(page.url.searchParams.get('tab') ?? (tabs[0].count ? 'wait' : 'all'));
	const openId = $derived(page.url.searchParams.get('id'));
	const open = $derived(openId ? all.find((c) => c.id === openId) : undefined);
	const rows = $derived(tab === 'all' ? all : all.filter((c) => c.tabs.includes(tab as (typeof c.tabs)[number])));
	const n = (id: string) => tabs.find((t) => t.id === id)?.count ?? 0;

	const EMPTY: Record<string, string> = {
		wait: '확인할 정산 정보가 없어요',
		redo: '다시 입력을 기다리는 크리에이터가 없어요',
		none: '정산 정보를 안 낸 크리에이터가 없어요',
		toss: '토스 본인인증을 기다리는 크리에이터가 없어요',
		ok: '확인 완료된 크리에이터가 없어요',
		stopped: '정지한 크리에이터가 없어요',
		all: '크리에이터가 없어요'
	};

	let raw = $state(false);
	/** [확인 완료] 결과 한 줄 — "이 크리에이터의 지급 건 N건이 지급 대기로 바뀌었어요" (§5-3) */
	let result = $state<string | null>(null);
	$effect(() => {
		void openId;
		raw = false;
		result = null;
	});
	function reveal() {
		raw = true;
		app.showToast('사업자 · 정산 정보 원문을 열었어요 · 열람 기록이 남아요');
	}

	let modal = $state<'verify' | 'redo' | 'stop' | 'resume' | null>(null);
	let inviting = $state(false);
	let why = $state('');
	const openRow = (id: string) => setParams(page.url, { id }, true);
	/** UI 단계 — 계정 정지 · 해제는 화면만(동작은 기능 단계에서 sellers.active RPC) */
	const soon = (what: string) => {
		app.showToast(`${what}는 다음 단계에서 붙어요`);
		modal = null;
	};
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-8 lg:pb-16">
	<PageHead title="크리에이터">
		{#snippet sum()}
			사업자 · 정산 정보 확인 대기 <b class="font-bold text-accent">{n('wait')}명</b> · 다시 입력 요청 {n('redo')} · 미입력 {n('none')} · 토스 인증 대기 {n('toss')} · 전체 {n('all')}명
		{/snippet}
		{#snippet actions()}
			<Btn onclick={() => (inviting = true)}><Icon id="send" size={16} />초대 보내기</Btn>
		{/snippet}
	</PageHead>

	<div class="mt-6"><FilterTabs {tabs} value={tab} label="사업자 정보 상태" onpick={(id) => setParams(page.url, { tab: id })} /></div>

	<div class="mt-4 hidden overflow-hidden rounded-3xl border border-white/8 bg-white/3 lg:block">
		<table class="w-full table-fixed text-left text-[14px]">
			<thead class="border-b border-white/8 text-[12px] font-bold text-white/60">
				<tr class="h-11">
					<th class="w-[230px] pl-5">크리에이터</th>
					<th class="w-[130px]">사업자 정보</th>
					<th class="w-[100px]">상품</th>
					<th>지급에 걸린 일</th>
					<th class="w-[150px]">가입일</th>
					<th class="w-12 pr-5"></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as c (c.id)}
					<tr onclick={() => openRow(c.id)} class="h-[60px] cursor-pointer border-b border-white/6 transition-colors last:border-b-0 hover:bg-white/4 {openId === c.id ? 'bg-white/5' : ''}">
						<td class="pl-5">
							<span class="flex items-center gap-2.5">
								<Avatar initial={c.initial} bg={c.avatarBg} size={32} />
								<span class="min-w-0"><span class="flex items-center gap-1.5"><span class="truncate font-bold">{c.name}{c.biz ? ` · ${c.biz.firm}` : ''}</span>{#if c.stopChip}<Chip label={c.stopChip.label} tone={c.stopChip.tone} />{/if}</span><span class="block truncate text-[12px] text-white/55">{c.handle}</span></span>
							</span>
						</td>
						<td><Chip label={c.settleChip.label} tone={c.settleChip.tone} /></td>
						<td class="text-[13px] text-white/75 tabular-nums">판매 중 {c.products.live}/{c.products.total}</td>
						<td class="pr-4">
							{#if c.payNote}<p class="truncate text-[13px] font-semibold {NOTE_CLS[c.payNoteTone]}" title={c.payNote}>{c.payNote}</p>{:else}<span class="text-[13px] text-white/40">—</span>{/if}
							{#if c.resubmitNote}<p class="truncate text-[12px] text-white/55" title={c.resubmitNote}>정보를 다시 냈어요 · {c.biz?.submittedAt}</p>{/if}
						</td>
						<td class="text-[13px] text-white/70">{c.joinedAt}</td>
						<td class="pr-5 text-white/35"><Icon id="chev" size={18} sw={2.2} /></td>
					</tr>
				{:else}
					<tr><td colspan="6" class="py-14 text-center text-[14px] text-white/55">{EMPTY[tab]}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<ul class="mt-4 flex flex-col gap-2 lg:hidden">
		{#each rows as c (c.id)}
			<li>
				<button type="button" onclick={() => openRow(c.id)} class="flex w-full items-start gap-3 rounded-[20px] border border-white/8 bg-white/3 p-4 text-left">
					<Avatar initial={c.initial} bg={c.avatarBg} size={40} />
					<span class="min-w-0 flex-1">
						<span class="flex items-center justify-between gap-2"><span class="flex min-w-0 items-center gap-1.5"><span class="truncate text-[15px] font-bold">{c.name}{c.biz ? ` · ${c.biz.firm}` : ''}</span>{#if c.stopChip}<Chip label={c.stopChip.label} tone={c.stopChip.tone} />{/if}</span><Chip label={c.settleChip.label} tone={c.settleChip.tone} /></span>
						<span class="mt-0.5 block text-[12px] text-white/55">{c.handle} · 판매 중 {c.products.live}/{c.products.total}</span>
						{#if c.payNote}<span class="mt-1.5 block text-[12px] leading-[1.5] font-semibold {NOTE_CLS[c.payNoteTone]}">{c.payNote}</span>{/if}
					</span>
				</button>
			</li>
		{:else}
			<li class="rounded-[20px] border border-white/8 bg-white/3 px-4 py-12 text-center text-[14px] text-white/55">{EMPTY[tab]}</li>
		{/each}
	</ul>
</div>

{#if open}
	<Drawer title="{open.name} {open.handle}" onclose={() => closeDrawer(page.url)}>
		{#snippet head()}
			<div class="flex items-center gap-3">
				<Avatar initial={open.initial} bg={open.avatarBg} size={48} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-[18px] font-extrabold">{open.name}</p>
					<p class="truncate text-[13px] text-white/55">{open.handle} · {open.joinedAt} 가입 · {open.active ? '활동 중' : '정지'}</p>
				</div>
				<Chip label={open.settleChip.label} tone={open.settleChip.tone} lg />
			</div>
			{#if open.stopNote}
				<div class="mt-4 rounded-2xl border border-danger/28 bg-danger/8 px-4 py-3 text-[13px] leading-[1.55]">
					<p class="font-bold text-danger-fg">정지 중이에요 · 샵에 상품이 보이지 않고 크리에이터 콘솔은 정지 화면만 보여요</p>
					<p class="mt-1 text-white/70">{open.stopNote}</p>
				</div>
			{/if}
			{#if result}
				<p class="mt-4 flex items-start gap-2 rounded-2xl border border-mint/25 bg-mint/8 px-4 py-3 text-[13px] leading-[1.55] font-semibold text-mint"><Icon id="check" size={16} sw={2.4} class="mt-0.5 shrink-0" />{result}</p>
			{/if}
			{#if open.payNote}
				<p class="mt-4 rounded-2xl px-4 py-3 text-[13px] leading-[1.55] font-semibold {open.payNoteTone === 'red' ? 'bg-danger/10 text-danger-fg' : 'bg-accent/10 text-accent'}">{open.payNote}</p>
			{/if}
		{/snippet}

		<Section title="사업자 · 정산 정보">
			{#snippet aside()}{open.biz ? `제출 ${open.biz.submittedAt}` : ''}{/snippet}
			{#if open.biz}
				{#if open.resubmitNote}<p class="mb-2.5 rounded-2xl bg-accent/8 px-4 py-3 text-[13px] leading-[1.55] text-white/85"><b class="font-bold text-accent">정보가 바뀌었어요</b> — {open.resubmitNote}</p>{/if}
				{#if open.redoWhy && open.settle === 'redo'}<p class="mb-2.5 rounded-2xl bg-danger/10 px-4 py-3 text-[13px] text-danger-fg">다시 입력 요청 사유 · {open.redoWhy}</p>{/if}
				<div class="rounded-2xl border border-white/8 px-4 py-1">
					<KV k="상호">{open.biz.firm}</KV>
					<KV k="대표자">{open.biz.owner}</KV>
					<KV k="사업자등록번호"><span class="tabular-nums">{raw ? open.biz.bizNo : open.biz.bizNoMasked}</span></KV>
					<KV k="세금계산서 이메일">{open.biz.email}</KV>
					<KV k="정산 계좌"><span class="tabular-nums">{raw ? `${open.biz.bank} ${open.biz.account}` : open.biz.accountMasked}</span></KV>
					<KV k="예금주">{raw ? open.biz.holder : open.biz.holderMasked}</KV>
				</div>
				{#if !raw}<button type="button" onclick={reveal} class="mt-2 inline-flex h-11 items-center gap-1.5 px-1 text-[13px] font-bold text-white/70 hover:text-fg"><Icon id="eye" size={16} />원문 보기 · 열람 기록이 남아요</button>{/if}
			{:else}
				<p class="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-[13px] text-white/55">아직 사업자 · 정산 정보를 안 냈어요 · 크리에이터 콘솔 내 정보에서 입력해요</p>
			{/if}
		</Section>

		<Section title="기본">
			<div class="rounded-2xl border border-white/8 px-4 py-1">
				<KV k="연락처"><span class="tabular-nums">{open.phoneMasked}</span></KV>
				<KV k="상품">판매 중 {open.products.live} / 전체 {open.products.total}</KV>
				<KV k="활동 상태">{#if open.stopChip}<Chip label={open.stopChip.label} tone={open.stopChip.tone} />{:else}활동 중{/if}</KV>
			</div>
			<div class="mt-2.5 flex justify-end">
				{#if open.active}
					<Btn sm onclick={() => { why = ''; modal = 'stop'; }}>계정 정지</Btn>
				{:else}
					<Btn sm onclick={() => (modal = 'resume')}>정지 해제</Btn>
				{/if}
			</div>
		</Section>

		<Section title="지급 이력">
			{#if open.payouts.length}
				<ul class="flex flex-col gap-2">
					{#each open.payouts as p (p.id)}
						<li>
							<a href="/payouts?tab=all&id={p.id}" class="flex items-center gap-3 rounded-2xl border border-white/8 px-4 py-3 hover:border-white/25">
								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-2 text-[14px] font-bold">{p.month}<span class="font-extrabold tabular-nums">{won(p.amount)}</span></span>
									<span class="mt-1 flex flex-wrap gap-1">{#each p.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}</span>
									{#if p.holdText}<span class="mt-1 block text-[12px] font-semibold text-danger-fg">보류 이유 · {p.holdText}</span>{/if}
								</span>
								{#if p.paidAt}<span class="text-[12px] text-white/55">{p.paidAt}</span>{/if}
								<Icon id="chev" size={16} sw={2.2} class="text-white/35" />
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-[13px] text-white/55">아직 지급 건이 없어요</p>
			{/if}
		</Section>

		{#if open.log.length}
			<Section title="이력"><Timeline items={open.log} /></Section>
		{/if}

		{#snippet footer()}
			{#if open.settle === 'wait'}
				<div class="min-w-0 flex-1"><Btn full onclick={() => { why = ''; modal = 'redo'; }}>다시 입력 요청</Btn></div>
				<div class="min-w-0 flex-[1.4]"><Btn kind="primary" full onclick={() => (modal = 'verify')}>확인 완료</Btn></div>
			{:else}
				<p class="w-full py-2 text-center text-[13px] text-white/55">{open.tabs.includes('toss') ? '크리에이터가 토스 본인인증을 하면 자동으로 확인 완료로 바뀌어요' : open.settle === 'ok' ? '확인이 끝난 정보예요 · 바뀌면 다시 확인 대기로 와요' : '크리에이터가 정보를 내면 확인할 수 있어요'}</p>
			{/if}
		{/snippet}
	</Drawer>
{/if}

{#if modal === 'verify' && open}
	<Modal
		title="사업자 · 정산 정보 확인 완료"
		desc="{open.name} · {open.biz?.firm}"
		ok="확인 완료"
		info={open.verifyNote}
		infoTone="mint"
		onclose={() => (modal = null)}
		onok={() => {
			result = server.verifySettle(open.id);
			app.showToast('사업자 · 정산 정보를 확인했어요');
			modal = null;
		}}
	>
		<div class="rounded-2xl bg-white/4 px-4 py-1">
			<KV k="정산 계좌">{open.biz?.accountMasked}</KV>
			<KV k="예금주">{open.biz?.holder}</KV>
			<KV k="상호 · 대표자">{open.biz?.firm} · {open.biz?.owner}</KV>
		</div>
	</Modal>
{:else if modal === 'redo' && open}
	<Modal title="다시 입력 요청" desc="{open.name} · {open.biz?.firm}" ok="다시 입력 요청" info="크리에이터 콘솔에 사유와 함께 보여요 · 다시 낼 때까지 지급 보류예요" disabled={!why.trim()} onclose={() => (modal = null)} onok={() => { result = null; app.showToast(server.redoSettle(open.id, why.trim())); modal = null; }}>
		<Field label="사유(필수)" count="{why.length}/100">
			<textarea bind:value={why} maxlength="100" rows="3" class={TEXTAREA} placeholder="예: 통장 사본의 예금주가 사업자 대표자와 달라요"></textarea>
		</Field>
	</Modal>
{/if}

{#if modal === 'stop' && open}
	<Modal
		title="계정 정지"
		desc="{open.name} {open.handle}"
		ok="정지"
		sure="정말 정지하기"
		danger
		info="정지하면 샵에서 이 크리에이터의 상품이 모두 내려가고, 크리에이터 콘솔은 정지 화면만 보여요 · 크리에이터가 콘솔에 못 들어오니 진행 중인 배송 · CS 답변은 운영이 챙겨야 해요"
		infoTone="red"
		disabled={!why.trim()}
		onclose={() => (modal = null)}
		onok={() => soon('계정 정지')}
	>
		<Field label="정지 사유(필수 · 운영만 봐요)" count="{why.length}/200">
			<textarea bind:value={why} maxlength="200" rows="3" class={TEXTAREA} placeholder="예: 상품 상세에 의약품 오인 표현을 반복해서 올림"></textarea>
		</Field>
	</Modal>
{:else if modal === 'resume' && open}
	<Modal
		title="정지 해제"
		desc="{open.name} {open.handle}"
		ok="정지 해제"
		info="판매 중이던 상품이 바로 다시 샵에 보이고, 크리에이터 콘솔을 다시 쓸 수 있어요"
		onclose={() => (modal = null)}
		onok={() => soon('정지 해제')}
	>
		{#if open.stopNote}<p class="rounded-2xl bg-white/4 px-4 py-3 text-[13px] leading-[1.55] text-white/70">{open.stopNote}</p>{/if}
	</Modal>
{/if}

{#if inviting}<InviteSend onclose={() => (inviting = false)} />{/if}
