<script lang="ts">
	import { settleAtLabel, settleInfoStep, shortDate, tossStep, type SettleTone } from '@sellery/myr-core/seller-settlement';
	import { PAYOUT_BLOCK_TEXT, PAYOUT_RULE_TEXT, SETTLE_CONFIRM_TEXT } from '@sellery/myr-core/settlement-rules';
	import { TAX_INVOICE_TONE, type TaxInvoice as Invoice } from '@sellery/myr-core/tax-invoice';
	import TaxInvoice from './TaxInvoice.svelte';

	/** 정산 상세 "지급까지 할 일"(시안 "MYR Influencer Admin" · "… PC" SETTLEMENT DETAIL · 2026-11-13) — ① 정산 정보 등록 ② 세금계산서 발행 ③ 토스 본인인증(0126).
	 *  ① 끝남 = 서버 보류 이유에 사업자 · 정산 정보(settle_info)가 없다 · ② 끝남 = 서버 accepted(myr_tax_invoice_accepted).
	 *  ③ 은 지급 방식이 토스일 때만(서버 payout_toss — 수동 지급이면 토스 인증 없이 지급된다) · 끝남 = 서버 보류 이유에 토스 본인인증(toss_auth)이 없다 ·
	 *    문구는 토스에서 할 일(서버 toss_ask) — 버튼은 내 정보의 토스 본인인증 카드로.
	 *  세금계산서는 정산이 확정된 뒤에 생긴다(작성일자 = 정산월 말일) — 다음 정산(예상)에서는 ② 를 안내만 한다.
	 *  모바일: 제목 아래 안내 · ② 본문은 왼쪽 정렬 / PC(lg~): 제목 줄 오른쪽 안내 · ② 본문은 번호 옆으로 들여 쓴다 */
	let {
		month,
		settleStatus,
		settleInfoDone,
		inv,
		depositRefund,
		payAt,
		payDueAt = null,
		toss = null
	}: {
		month: string;
		settleStatus: string;
		settleInfoDone: boolean;
		inv: Invoice | null;
		depositRefund: number;
		payAt: string | null;
		payDueAt?: string | null;
		toss?: { done: boolean; ask: string | null } | null;
	} = $props();

	const CHIP: Record<SettleTone, string> = {
		plan: 'bg-[#a8dcc8]/16 text-[#a8dcc8]',
		hold: 'bg-[#ff6b6b]/14 text-[#ff8a8a]',
		warn: 'bg-accent/16 text-accent',
		done: 'bg-white/6 text-white/50'
	};
	const step1 = $derived(settleInfoStep(settleStatus));
	const invDone = $derived(!!inv?.accepted);
	const step3 = $derived(tossStep(toss?.ask ?? null));
	const left = $derived((settleInfoDone ? 0 : 1) + (invDone ? 0 : 1) + (toss && !toss.done ? 1 : 0));
	// 할 일이 남았으면 개수만 · 다 끝났으면 지급 예정 시각(서버 pay_due_at · 0111 — 자동 이체 다음 오후 1시) · 예정이 없으면(이체 실패 · 운영 보류 등은 따로 안내) 날짜 없이
	const todoText = $derived(left ? `${['', '한', '두', '세'][left]} 가지를 마치면 지급돼요` : payDueAt ? `모두 끝났어요. ${settleAtLabel(payDueAt)}에 입금돼요` : '모두 끝났어요');
</script>

{#snippet dot(n: number, done: boolean)}
	<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-extrabold {done ? 'border-[#a8dcc8] bg-[#a8dcc8]' : 'border-white/30 text-white/85'}">
		{#if done}
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			<span class="sr-only">완료</span>
		{:else}{n}{/if}
	</span>
{/snippet}

<!-- 칩 — 시안: ① 은 12px(5px 10px) · ② 상태는 모바일 11px(4px 8px) · PC 는 둘 다 12px -->
{#snippet chip(label: string, cls: string, small = false)}
	<span class="shrink-0 rounded-lg font-bold whitespace-nowrap {small ? 'px-2 py-1 text-[11px] lg:px-2.5 lg:py-[5px] lg:text-[12px]' : 'px-2.5 py-[5px] text-[12px]'} {cls}">{label}</span>
{/snippet}

<section aria-label="지급까지 할 일" class="mt-4 rounded-[22px] border border-white/8 bg-panel p-[18px] lg:mt-0 lg:mb-[22px] lg:rounded-3xl lg:p-6">
	<div class="lg:flex lg:items-baseline lg:justify-between lg:gap-3">
		<p class="text-[15px] font-extrabold lg:text-[16px]">지급까지 할 일</p>
		<p class="mt-1 text-[12px] text-white/55 lg:mt-0 lg:text-[13px]">{todoText}</p>
	</div>

	<!-- ① 정산 정보 등록 -->
	<div class="mt-4 flex items-center gap-3 lg:mt-[18px] lg:gap-3.5">
		{@render dot(1, settleInfoDone)}
		<span class="min-w-0 flex-1">
			<span class="block text-[14px] font-bold lg:text-[15px]">정산 정보 등록</span>
			<span class="mt-0.5 block text-[12px] text-white/55 lg:text-[13px]">{settleInfoDone ? '사업자 · 정산 계좌' : step1.sub}</span>
		</span>
		{#if settleInfoDone}
			{@render chip('완료', CHIP.done)}
		{:else if step1.action}
			<a href="/my" class="flex h-[38px] shrink-0 items-center rounded-xl bg-accent px-3.5 text-[13px] font-extrabold text-bg lg:h-10 lg:px-4 lg:hover:bg-[#ff8f5c]">{step1.action}</a>
		{:else if step1.chip}
			{@render chip(step1.chip, 'bg-white/8 text-white/85')}
		{/if}
	</div>

	<div class="my-4 h-px bg-white/7 lg:my-[18px]"></div>

	<!-- ② 세금계산서 발행 -->
	<div class="flex items-center gap-3 lg:gap-3.5">
		{@render dot(2, invDone)}
		<span class="min-w-0 flex-1">
			<span class="block text-[14px] font-bold lg:text-[15px]">세금계산서 발행</span>
			{#if inv}
				<span class="mt-0.5 block text-[12px] text-white/55 lg:text-[13px]">
					<span class="hidden lg:inline">홈택스에서 발행한 뒤 승인번호를 내주세요 &nbsp; </span><b class="font-semibold {inv.overdue ? 'text-[#ff8a8a]' : 'text-fg'}">{shortDate(inv.dueDate)}까지 &nbsp;</b><span class="lg:hidden"> 승인번호 제출</span>
				</span>
			{:else}
				<span class="mt-0.5 block text-[12px] text-white/55 lg:text-[13px]">{shortDate(payAt)} 정산이 확정되면 발행할 금액이 나와요</span>
			{/if}
		</span>
		{#if inv}
			<span class="flex shrink-0 flex-col items-end gap-1 lg:flex-row lg:items-center lg:gap-1.5">
				{@render chip(inv.statusLabel, CHIP[TAX_INVOICE_TONE[inv.status]], true)}
				{#if inv.overdue}{@render chip('기한 지남', CHIP.hold, true)}{/if}
			</span>
		{:else}
			{@render chip('정산 확정 뒤', CHIP.done, true)}
		{/if}
	</div>
	{#if inv}
		<div class="mt-3.5 lg:mt-4 lg:ml-[42px]"><TaxInvoice {month} {inv} {depositRefund} /></div>
	{/if}

	{#if toss}
		<div class="my-4 h-px bg-white/7 lg:my-[18px]"></div>

		<!-- ③ 토스 본인인증(0126 · 지급 방식이 토스일 때만) -->
		<div class="flex items-center gap-3 lg:gap-3.5">
			{@render dot(3, toss.done)}
			<span class="min-w-0 flex-1">
				<span class="block text-[14px] font-bold lg:text-[15px]">토스 본인인증</span>
				<span class="mt-0.5 block text-[12px] text-white/55 lg:text-[13px]">{toss.done ? '토스페이먼츠 지급 등록' : step3.sub}</span>
			</span>
			{#if toss.done}
				{@render chip('완료', CHIP.done)}
			{:else if step3.action}
				<a href="/my" class="flex h-[38px] shrink-0 items-center rounded-xl bg-accent px-3.5 text-[13px] font-extrabold text-bg lg:h-10 lg:px-4 lg:hover:bg-[#ff8f5c]">{step3.action}</a>
			{:else if step3.chip}
				{@render chip(step3.chip, 'bg-white/8 text-white/85')}
			{/if}
		</div>
	{/if}

	<!-- 정산 확정 · 지급 규칙(2026-11-13 · 자동 이체) — "정산일"을 돈이 들어오는 날로 읽지 않게 둘을 나눠 적고, 세금계산서가 없으면 지급되지 않는다는 것을 같이 -->
	<div class="mt-4 border-t border-white/7 pt-3.5 text-[12px] leading-[1.65] text-white/50 lg:mt-[18px] lg:text-[12.5px]">
		<p><b class="font-semibold text-white/70">정산 확정</b> : {SETTLE_CONFIRM_TEXT}</p>
		<p><b class="font-semibold text-white/70">지급</b> : {PAYOUT_RULE_TEXT}</p>
		<p class="mt-0.5 font-semibold text-[#ff8a8a]">{PAYOUT_BLOCK_TEXT}</p>
	</div>
</section>
