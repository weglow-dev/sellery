<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { COMPANY } from '@sellery/myr-core/company';
	import { shortDate } from '@sellery/myr-core/seller-settlement';
	import { approvalNoText, normalizeApprovalNo, TAX_INVOICE_GUIDE, taxInvoiceMessage, type TaxInvoice } from '@sellery/myr-core/tax-invoice';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';

	/** 세금계산서(0104) — 정산 상세 "지급까지 할 일" 2단계 본문(시안 2026-11-13 "홈택스에 이대로 입력하세요" · 승인번호 입력 · 낸 승인번호 수정).
	 *  금액 · 날짜 · 제출 가능 · 다시 제출 요청 사유는 서버 값(myr_payout_invoice_json) — 여기서는 승인번호 형식만 미리 본다(서버가 다시 본다).
	 *  보증금 환급은 세금계산서에 넣지 않는다(세무 답변 2026-11-12) — 이 달에 환급이 있으면 한 줄 안내.
	 *  모바일: 2칸 표 · 입력 아래 버튼 / PC(lg~): 4칸 표 · 입력 옆 버튼 */
	let { month, inv, depositRefund }: { month: string; inv: TaxInvoice; depositRefund: number } = $props();

	let draft = $state('');
	let touched = $state(false);
	let saving = $state(false);
	// 낸 승인번호를 고쳐 내는 중(확인 전에만 — 서버 can_submit)
	let editing = $state(false);
	const no = $derived(normalizeApprovalNo(draft));
	const bad = $derived(touched && draft.trim() !== '' && !no);
	// 입력 칸 — 낼 수 있고, 아직 안 냈거나 · 고치는 중이거나 · 운영팀이 다시 제출을 요청했을 때
	const showInput = $derived(inv.canSubmit && (!inv.approvalNo || editing || !!inv.returnNote));

	async function submit() {
		touched = true;
		if (!no || saving) return;
		saving = true;
		try {
			const res = await fetch('/api/my/settle/invoice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month, approvalNo: draft }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
			if (!r?.ok) {
				app.showToast(taxInvoiceMessage(r?.code ?? 'DB_ERROR'));
				return;
			}
			app.showToast('승인번호를 냈어요 · 운영팀이 홈택스에서 확인하면 지급돼요');
			draft = '';
			touched = false;
			editing = false;
			await invalidateAll();
		} catch {
			app.showToast('보내지 못했어요. 인터넷 연결을 확인해주세요');
		} finally {
			saving = false;
		}
	}
	function edit() {
		editing = true;
		draft = inv.approvalNo ? approvalNoText(inv.approvalNo) : '';
		touched = false;
	}
	function cancel() {
		editing = false;
		draft = '';
		touched = false;
	}
</script>

{#snippet cell(k: string, v: string, cls = '', vcls = '', wrap = false)}
	<div class="min-w-0 {cls}">
		<span class="block text-[12px] text-white/50">{k}</span>
		<span class="mt-[3px] block text-[14px] font-bold tabular-nums lg:text-[15px] {wrap ? 'break-all lg:truncate' : 'truncate'} {vcls || 'text-fg'}">{v}</span>
	</div>
{/snippet}

<div class="rounded-2xl bg-white/4 px-4 py-3.5 lg:px-[18px] lg:py-4">
	<p class="mb-3 text-[12px] font-bold text-white/55">홈택스에 이대로 입력하세요</p>
	<div class="grid grid-cols-2 gap-x-2.5 gap-y-3 lg:grid-cols-4 lg:gap-x-3 lg:gap-y-3.5">
		{@render cell('공급받는자', COMPANY.name)}
		{@render cell('사업자번호', COMPANY.bizNo)}
		<!-- 이메일은 모바일에서 한 줄 전체(잘리지 않게) -->
		{@render cell('이메일', COMPANY.email, 'col-span-2', '', true)}
		{@render cell('작성일자', shortDate(inv.writeDate))}
		{@render cell('공급가액', won(inv.supply))}
		{@render cell('세액', won(inv.tax))}
		{@render cell('합계', won(inv.total), '', 'text-accent text-[16px] lg:text-[15px]')}
	</div>
</div>
<p class="mt-2.5 text-[12px] leading-[1.6] text-white/45">
	{#if depositRefund}보증금 환급 {won(depositRefund)}은 세금계산서에 넣지 않아요.<br class="lg:hidden" />{' '}{/if}{#if inv.canSubmit}기한을 넘기거나 발행하지 않으면 가산세(국세청에 내는 세금)가 붙을 수 있어요.{/if}
</p>

{#if inv.amountChanged}
	<p class="mt-3 rounded-xl bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[12px] leading-[1.55] text-[#ff8a8a]">낸 뒤 금액이 바뀌었어요. 위 금액으로 다시 발행하고 새 승인번호를 내 주세요.</p>
{/if}
{#if inv.returnNote}
	<div class="mt-3 rounded-xl bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[12px] leading-[1.55]">
		<span class="block font-bold text-[#ff8a8a]">운영팀 요청</span>
		<span class="mt-0.5 block text-white/75">{inv.returnNote}</span>
	</div>
{/if}

{#if showInput}
	<div class="mt-3.5 lg:flex lg:gap-2.5">
		<input
			aria-label="승인번호"
			inputmode="text"
			autocomplete="off"
			placeholder="승인번호 24자리"
			maxlength="40"
			bind:value={draft}
			onblur={() => (touched = true)}
			class="h-[52px] w-full rounded-[14px] border-[1.5px] px-4 text-[16px] text-fg tabular-nums outline-none placeholder:text-white/35 focus:border-accent focus:bg-accent/5 lg:min-w-0 lg:flex-1 lg:text-[15px] {bad ? 'border-accent bg-accent/6' : 'border-white/10 bg-white/4'}"
		/>
		<div class="mt-2 flex gap-2 lg:mt-0 lg:contents">
			{#if editing}
				<button type="button" onclick={cancel} class="h-[50px] w-[88px] shrink-0 rounded-[14px] border-[1.5px] border-white/14 text-[14px] font-bold text-fg lg:h-[52px] lg:w-auto lg:px-4">취소</button>
			{/if}
			<button
				type="button"
				onclick={submit}
				disabled={!no || saving}
				class="h-[50px] flex-1 rounded-[14px] text-[15px] font-extrabold transition-colors lg:h-[52px] lg:flex-none lg:px-5 lg:text-[14px] {no && !saving ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/40'}"
			>
				{saving ? '보내는 중…' : '승인번호 내기'}
			</button>
		</div>
	</div>
	{#if bad}<p class="mt-1.5 text-[12px] text-accent">{taxInvoiceMessage('BAD_NO')}</p>{/if}
{:else if inv.approvalNo}
	<div class="mt-3.5 flex items-center gap-3 rounded-[14px] border border-white/10 py-3 pr-3 pl-4">
		<span class="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3">
			<span class="block text-[11px] text-white/50 lg:shrink-0 lg:text-[12px]">낸 승인번호</span>
			<span class="mt-0.5 block truncate text-[13px] font-bold tabular-nums lg:mt-0 lg:text-[14px]">{approvalNoText(inv.approvalNo)}</span>
		</span>
		{#if inv.canSubmit}
			<button type="button" onclick={edit} class="h-[34px] shrink-0 rounded-[10px] border border-white/14 px-3 text-[12px] font-bold text-fg hover:border-white/35">수정</button>
		{/if}
	</div>
{/if}
{#if TAX_INVOICE_GUIDE[inv.status] && !showInput}<p class="mt-2.5 text-[12px] leading-[1.6] text-white/45">{TAX_INVOICE_GUIDE[inv.status]}</p>{/if}
