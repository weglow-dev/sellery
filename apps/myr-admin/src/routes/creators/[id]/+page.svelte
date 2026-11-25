<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Avatar from '$lib/components/Avatar.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InfoRow from '$lib/components/InfoRow.svelte';
	import MaskValue from '$lib/components/MaskValue.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Note from '$lib/components/Note.svelte';
	import PanelBtn from '$lib/components/PanelBtn.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 크리에이터 상세 — docs/myr-admin-screens.md §5-3 (시안 "MYR Admin PC" · "MYR Admin" 크리에이터 상세 · 2026-11-25).
	 *  머리(뒤로 · 아바타 · 이름 · 활성/정지 · 사업자 정보 · 토스 칩) · 왼쪽 기본 정보 · 사업자 · 정산 정보 · 토스 지급대행 · 상품 · 지급 이력 · 활동
	 *  / 오른쪽(판매 중 상품 · 안내 · [다시 입력 요청] [확인 완료] · [추가 인증 안내 보내기] · [파트너팀 톡 열기] · [정지]/[복구]).
	 *  모바일: 머리 아래 "판매 중 상품 N개" · 안내 → 확인 버튼 → 본문 → 맨 아래 "관리" 칸(톡 · 정지). 칩 · 문구 · 버튼은 서버(목) 값.
	 *  [확인 완료] · [다시 입력 요청]은 목에서 동작하고, 정지 · 복구 · 추가 인증 안내는 UI 단계라 "다음 단계" 안내만 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(server.crDetail(id));

	let armed = $state(false);
	let redo = $state(false);
	let why = $state('');
	$effect(() => {
		void id;
		armed = false;
		redo = false;
	});
	const soon = (what: string) => app.showToast(`${what}는 다음 단계에서 붙어요`);
	const verify = () => app.showToast(server.verifySettle(id));

	const PROD_COLS = 'grid-cols-[minmax(0,1.6fr)_110px_100px_80px]';
	const PAY_COLS = 'grid-cols-[90px_minmax(0,1fr)_110px_110px_12px]';
	const NOTE = 'mt-2.5 rounded-[10px] bg-accent/8 px-3 py-2.5 text-[13px] leading-[1.5] font-semibold text-[#ff9a66]';
	const NOTE_GREY = 'pt-1 text-[13px] leading-[1.5] font-semibold text-white/50';
</script>

{#snippet verifyRow(sm: boolean)}
	<div class="flex gap-2">
		<PanelBtn {sm} tone="line" onclick={() => ((why = ''), (redo = true))}>다시 입력 요청</PanelBtn>
		<PanelBtn {sm} tone="primary" onclick={verify}>확인 완료</PanelBtn>
	</div>
{/snippet}

{#snippet manage(sm: boolean)}
	{#if v}
		{#if v.can.kyc && !sm}<div class="flex gap-2"><PanelBtn {sm} onclick={() => soon('추가 인증 안내 보내기')}>추가 인증 안내 보내기</PanelBtn></div>{/if}
		<div class="flex gap-2"><PanelBtn {sm} onclick={() => goto(v.talkHref)}>파트너팀 톡 열기</PanelBtn></div>
		<div class="flex flex-col gap-2">
			<div class="flex gap-2">
				{#if v.can.restore}
					<PanelBtn {sm} onclick={() => soon('복구')}>복구</PanelBtn>
				{:else if armed}
					<PanelBtn {sm} onclick={() => (armed = false)}>취소</PanelBtn>
					<PanelBtn {sm} tone="solidRed" onclick={() => ((armed = false), soon('정지'))}>정말 정지하기</PanelBtn>
				{:else}
					<PanelBtn {sm} tone="danger" onclick={() => (armed = true)}>정지</PanelBtn>
				{/if}
			</div>
			{#if armed}<p class="text-[12.5px] leading-[1.45] font-semibold text-danger-fg">{v.stopNote}</p>{/if}
		</div>
	{/if}
{/snippet}

{#if !v}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">크리에이터를 찾을 수 없어요</p>
		<a href="/creators" class="mt-3 inline-block text-[14px] font-bold text-accent">크리에이터 목록으로</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<!-- 머리 -->
		<div class="flex flex-wrap items-center gap-x-3 gap-y-3 lg:min-h-[52px] lg:flex-nowrap lg:gap-x-3.5">
			<a href="/creators" aria-label="크리에이터 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
			<span class="lg:hidden"><Avatar initial={v.initial} bg={v.avatarBg} size={36} /></span>
			<span class="hidden lg:block"><Avatar initial={v.initial} bg={v.avatarBg} size={48} /></span>
			<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{v.name}</h1>
			<div class="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0 lg:gap-2">
				{#each v.headChips as c (c.label)}<Chip label={c.label} tone={c.tone} md />{/each}
				<span class="text-[13px] text-white/50 tabular-nums lg:hidden">{v.liveText}</span>
			</div>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3 lg:gap-3.5">
				<!-- 모바일 — 안내 · 확인 버튼이 위 -->
				{#if v.sideNote}<div class="lg:hidden"><Note text={v.sideNote} /></div>{/if}
				{#if v.can.verify}<div class="flex flex-col gap-2 lg:hidden">{@render verifyRow(false)}</div>{/if}
				{#if v.can.kyc}<div class="flex gap-2 lg:hidden"><PanelBtn onclick={() => soon('추가 인증 안내 보내기')}>추가 인증 안내 보내기</PanelBtn></div>{/if}

				<DetailCard title="기본 정보">
					<InfoRow k="활동명">{v.basic.name}</InfoRow>
					<InfoRow k="대표 채널">{v.basic.channel}</InfoRow>
					<InfoRow k="연락처"><MaskValue masked={v.basic.phone.masked} raw={v.basic.phone.raw} what="연락처" /></InfoRow>
					<InfoRow k="가입일">{v.basic.joined}</InfoRow>
				</DetailCard>

				<DetailCard title="사업자 · 정산 정보" chips={[v.biz.chip]}>
					{#if v.biz.info}
						<InfoRow k="상호">{v.biz.info.firm}</InfoRow>
						<InfoRow k="사업자등록번호"><MaskValue masked={v.biz.info.bizNo.masked} raw={v.biz.info.bizNo.raw} what="사업자등록번호" /></InfoRow>
						<InfoRow k="대표자">{v.biz.info.owner}</InfoRow>
						<InfoRow k="세금계산서 이메일">{v.biz.info.email}</InfoRow>
						<InfoRow k="정산 계좌"><MaskValue masked={v.biz.info.account.masked} raw={v.biz.info.account.raw} what="정산 계좌" /></InfoRow>
						<InfoRow k="제출 시각">{v.biz.info.submittedAt}</InfoRow>
					{:else}
						{#each ['상호', '사업자등록번호', '대표자', '세금계산서 이메일', '정산 계좌'] as k (k)}<InfoRow {k} tone="grey">—</InfoRow>{/each}
					{/if}
					{#if v.biz.note}<p class={v.biz.noteGrey ? NOTE_GREY : NOTE}>{v.biz.note}</p>{/if}
				</DetailCard>

				{#if v.toss}
					<DetailCard title="토스 지급대행" chips={[v.toss.chip]}>
						<InfoRow k="셀러 상태" tone={v.toss.state.tone}>{v.toss.state.text}</InfoRow>
						{#if v.toss.limit}<InfoRow k="지급 한도">{v.toss.limit}</InfoRow>{/if}
						{#if v.toss.note}<p class={NOTE}>{v.toss.note}</p>{/if}
					</DetailCard>
				{/if}

				<DetailCard title="상품 {v.products.length}개">
					{#if v.products.length}
						<div class="no-bar -mx-[18px] overflow-x-auto px-[18px] lg:mx-0 lg:px-0">
							<div class="min-w-[470px]">
								<div class="grid {PROD_COLS} items-end gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] font-semibold text-white/50">
									<span>상품</span><span>상태</span><span class="text-right">가격</span><span class="text-right">재고</span>
								</div>
								{#each v.products as p (p.id)}
									<a href={p.href} class="grid {PROD_COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] tabular-nums hover:bg-white/3">
										<span class="truncate font-semibold">{p.name}</span>
										<span><Chip label={p.chip.label} tone={p.chip.tone} md /></span>
										<span class="text-right">{p.priceText}</span>
										<span class="text-right">{p.stockText}</span>
									</a>
								{/each}
							</div>
						</div>
					{:else}
						<p class="py-6 text-center text-[13.5px] text-white/55">등록한 상품이 없어요</p>
					{/if}
				</DetailCard>

				<DetailCard title="지급 이력">
					{#if v.payouts.length}
						<div class="no-bar -mx-[18px] overflow-x-auto px-[18px] lg:mx-0 lg:px-0">
							<div class="min-w-[470px]">
								<div class="grid {PAY_COLS} items-end gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] font-semibold text-white/50">
									<span>정산월</span><span>보류 이유 · 메모</span><span>상태</span><span class="text-right">금액</span><span></span>
								</div>
								{#each v.payouts as p (p.id)}
									<a href={p.href} class="grid {PAY_COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] tabular-nums hover:bg-white/3">
										<span>{p.month}</span>
										<span class="truncate {p.reasonRed ? 'text-danger-fg' : 'text-white/60'}">{p.reason}</span>
										<span>{#if p.chip}<Chip label={p.chip.label} tone={p.chip.tone} md />{/if}</span>
										<span class="text-right font-semibold">{p.amountText}</span>
										<span class="text-right text-white/45">›</span>
									</a>
								{/each}
							</div>
						</div>
					{:else}
						<p class="py-6 text-center text-[13.5px] text-white/55">아직 지급 건이 없어요</p>
					{/if}
				</DetailCard>

				<DetailCard title="활동"><Timeline items={v.activity} oldFirst who={false} /></DetailCard>

				<!-- 모바일 "관리" 칸 — 톡 · 정지/복구는 맨 아래 -->
				<div class="mt-2 flex flex-col gap-2 border-t border-white/8 pt-[18px] lg:hidden">
					<p class="text-[12.5px] font-bold text-white/45">관리</p>
					{@render manage(true)}
				</div>
			</div>

			<!-- 오른쪽 고정 패널(PC) -->
			<aside class="sticky top-7 hidden flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-6 lg:flex">
				<div><InfoRow k="판매 중 상품">{v.liveText.replace('판매 중 상품 ', '')}</InfoRow></div>
				{#if v.sideNote}<Note text={v.sideNote} />{/if}
				<div class="flex flex-col gap-2">
					{#if v.can.verify}{@render verifyRow(false)}{/if}
					{@render manage(false)}
				</div>
			</aside>
		</div>
	</div>

	{#if redo}
		<Modal
			title="다시 입력 요청"
			desc="{v.name} · 사업자 · 정산 정보"
			ok="다시 입력 요청"
			info="크리에이터에게 사유와 함께 알림이 가요 · 다시 낼 때까지 지급 건은 지급 보류예요"
			disabled={!why.trim()}
			onclose={() => (redo = false)}
			onok={() => {
				if (!why.trim()) return '사유를 적어 주세요';
				app.showToast(server.redoSettle(id, why.trim()));
				redo = false;
			}}
		>
			<Field label="사유" count="{why.length}/200">
				<textarea bind:value={why} maxlength="200" rows="3" class={TEXTAREA} placeholder="무엇을 고쳐야 하는지 적어 주세요"></textarea>
			</Field>
		</Modal>
	{/if}
{/if}
