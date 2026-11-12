<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { COMPANY } from '@sellery/myr-core/company';
	import { shortDate, type SettleTone } from '@sellery/myr-core/seller-settlement';
	import { approvalNoText, normalizeApprovalNo, TAX_INVOICE_GUIDE, TAX_INVOICE_TONE, taxInvoiceMessage, type TaxInvoice } from '@sellery/myr-core/tax-invoice';
	import { authInput } from '$lib/auth-ui';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';

	/** 세금계산서(0104 · 정산 상세 "지급 정보" 아래) — 발행할 금액(합계 · 공급가액 · 세액) · 작성일자 · 발행 기한 · 공급받는자 · 승인번호 입력 · 상태(제출 전 · 확인 중 · 확인 완료 · 다시 제출 필요 + 사유).
	 *  금액 · 날짜 · 기한 지남 · 제출 가능은 서버 값(myr_payout_invoice_json) — 여기서는 승인번호 형식만 미리 본다(서버가 다시 본다).
	 *  보증금 환급은 세금계산서에 넣지 않는다(세무 답변 2026-11-12) — 이 달에 환급이 있으면 한 줄 안내. */
	let { month, inv, depositRefund }: { month: string; inv: TaxInvoice; depositRefund: number } = $props();
	// 정산 상세는 모바일 · PC 칸에 하나씩 그린다 — 입력 id 가 겹치지 않게
	const uid = $props.id();

	const CHIP: Record<SettleTone, string> = {
		plan: 'bg-[#a8dcc8]/16 text-[#a8dcc8]',
		hold: 'bg-[#ff6b6b]/14 text-[#ff8a8a]',
		warn: 'bg-accent/16 text-accent',
		done: 'bg-white/6 text-white/50'
	};
	let draft = $state('');
	let touched = $state(false);
	let saving = $state(false);
	const no = $derived(normalizeApprovalNo(draft));
	const bad = $derived(touched && draft.trim() !== '' && !no);

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
			await invalidateAll();
		} catch {
			app.showToast('보내지 못했어요. 인터넷 연결을 확인해주세요');
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-2.5 text-[14px]">
	<div class="flex items-center gap-2">
		<span class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold whitespace-nowrap {CHIP[TAX_INVOICE_TONE[inv.status]]}">{inv.statusLabel}</span>
		{#if inv.overdue}<span class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold whitespace-nowrap {CHIP.hold}">발행 기한 지남</span>{/if}
	</div>
	<div class="flex justify-between text-white/60"><span>공급가액</span><span class="font-semibold text-fg tabular-nums">{won(inv.supply)}</span></div>
	<div class="flex justify-between text-white/60"><span>세액</span><span class="font-semibold text-fg tabular-nums">{won(inv.tax)}</span></div>
	<div class="flex justify-between text-white/60"><span>합계</span><span class="font-extrabold text-fg tabular-nums">{won(inv.total)}</span></div>
	<div class="flex justify-between text-white/60"><span>작성일자</span><span class="font-semibold text-fg">{shortDate(inv.writeDate)}</span></div>
	<div class="flex justify-between text-white/60"><span>발행 기한</span><span class="font-semibold {inv.overdue ? 'text-[#ff8a8a]' : 'text-fg'}">{shortDate(inv.dueDate)}까지</span></div>
	<div class="flex justify-between gap-3 text-white/60"><span class="shrink-0">공급받는자</span><span class="text-right font-semibold text-fg">{COMPANY.name} · {COMPANY.bizNo}</span></div>
	<p class="text-[12px] leading-[1.6] text-white/45">
		홈택스에서 위 금액 · 작성일자로 정발행해 주세요(공급받는자 이메일 {COMPANY.email}).{#if depositRefund}{' '}보증금 환급 {won(depositRefund)} 은 세금계산서에 넣지 않아요.{/if}
	</p>

	{#if inv.amountChanged}
		<p class="rounded-xl bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[12px] leading-[1.55] text-[#ff8a8a]">낸 뒤 금액이 바뀌었어요. 위 금액으로 다시 발행하고 새 승인번호를 내 주세요.</p>
	{/if}
	{#if inv.returnNote}
		<div class="rounded-xl bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[12px] leading-[1.55]">
			<span class="block font-bold text-[#ff8a8a]">운영팀 요청</span>
			<span class="mt-0.5 block text-white/75">{inv.returnNote}</span>
		</div>
	{/if}
	{#if inv.approvalNo}
		<div class="flex justify-between gap-3 text-white/60"><span class="shrink-0">낸 승인번호</span><span class="font-semibold text-fg tabular-nums">{approvalNoText(inv.approvalNo)}</span></div>
	{/if}

	{#if inv.canSubmit}
		<label for="{uid}-no" class="mt-1 text-[13px] font-semibold text-white/80">{inv.approvalNo ? '승인번호 고쳐 내기' : '승인번호'}</label>
		<input
			id="{uid}-no"
			inputmode="text"
			autocomplete="off"
			placeholder="20261201-41000000-12345678"
			maxlength="40"
			bind:value={draft}
			onblur={() => (touched = true)}
			class={authInput({ size: 'md', invalid: bad, filled: !!draft })}
		/>
		{#if bad}<p class="text-[12px] text-accent">{taxInvoiceMessage('BAD_NO')}</p>{/if}
		<button type="button" onclick={submit} disabled={saving} class="mt-1 h-[50px] w-full rounded-2xl text-[15px] font-extrabold transition-colors {no && !saving ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/45'}">
			{saving ? '보내는 중…' : inv.approvalNo ? '다시 내기' : '승인번호 내기'}
		</button>
	{/if}
	{#if TAX_INVOICE_GUIDE[inv.status]}<p class="text-[12px] leading-[1.6] text-white/45">{TAX_INVOICE_GUIDE[inv.status]}</p>{/if}
</div>
