<script lang="ts">
	import { payoutNotice, type PayoutTransfer, type SettleTone } from '@sellery/myr-core/seller-settlement';

	/** 자동 이체 안내(0111 · 2026-11-13) — 송금 중 · 지급 지연(재시도) · 지급 실패(계좌 문제 → 다시 입력) · 지급 확인 중(운영 쪽 원인 — 이유는 보여 주지 않는다).
	 *  보일지 · 종류 · 다시 보내는 시각은 서버 값(transfer · pay_due_at) — 여기서는 문구 · 색만 고른다(payoutNotice) */
	let { transfer, payDueAt }: { transfer: PayoutTransfer | null; payDueAt: string | null } = $props();
	const n = $derived(payoutNotice(transfer, payDueAt));
	const BOX: Record<SettleTone, string> = {
		plan: 'border-[#a8dcc8]/25 bg-[#a8dcc8]/8',
		hold: 'border-[#ff6b6b]/30 bg-[#ff6b6b]/8',
		warn: 'border-accent/25 bg-accent/8',
		done: 'border-white/10 bg-white/4'
	};
	const TITLE: Record<SettleTone, string> = { plan: 'text-[#a8dcc8]', hold: 'text-[#ff8a8a]', warn: 'text-accent', done: 'text-fg' };
</script>

{#if n}
	<div role="status" class="mt-3 flex items-center gap-3 rounded-[18px] border px-4 py-3.5 lg:mt-0 lg:mb-4 lg:rounded-[20px] lg:px-5 lg:py-4 {BOX[n.tone]}">
		<span class="min-w-0 flex-1">
			<span class="block text-[14px] font-bold lg:text-[15px] {TITLE[n.tone]}">{n.title}</span>
			<span class="mt-0.5 block text-[12px] leading-[1.55] text-white/65 lg:text-[13px]">{n.body}</span>
		</span>
		{#if n.cta}
			<a href={n.cta.href} class="flex h-[38px] shrink-0 items-center rounded-xl bg-accent px-3.5 text-[13px] font-extrabold text-bg lg:h-10 lg:px-4 lg:hover:bg-[#ff8f5c]">{n.cta.label}</a>
		{/if}
	</div>
{/if}
