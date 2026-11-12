<script lang="ts">
	import { dDay, ledgerCard, monthShort, monthStatus, settleAtLabel, shortDate, type SettleTone } from '@sellery/myr-core/seller-settlement';
	import { won } from '$lib/rules';
	import { readParam, syncParam } from '$lib/url-state';
	import Icon from '$lib/components/Icon.svelte';
	import SettleHold from '$lib/components/SettleHold.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 정산(0089 · 시안 "MYR Influencer Admin" · "… PC" 정산 탭 · 2026-11-10). 계산은 DB(0087 · 0089) — 여기는 보여 주기만.
	 *  [정산 내역 | 제조금액 · 보증금] 전환(주소 ?view=mfg — 상세에 갔다 와도 그대로).
	 *  정산 내역: 보류 배너(사업자 정보 확인 전) · 다음 정산 카드(D-day · 예상 지급액 · 상태 · 판매 · 정산금 · 상계 · 보증금 → 상세) · 월별 정산(다음 정산 + 지난 회차 → /settle/<월>).
	 *  제조금액 · 보증금: 안내 · 제품별 카드(상환 중/완료 · 남은 금액 · 막대(갚은 % + 다음 정산 상환 예정) · 보증금).
	 *  지난 회차 상태 · 보류 사유는 지급 건 서버 값(지급 대기 · 지급 보류 · 지급 완료 · 지급 없음 — 0102). 모바일: 한 줄 · PC(lg~): 1240px · 카드 2단 */
	let { data } = $props();
	const st = $derived(data.settle);
	const pv = $derived(st.preview);

	let view = $state<'pay' | 'mfg'>(readParam('view', ['pay', 'mfg'] as const, 'pay'));
	$effect(() => syncParam('view', view, 'pay'));

	// 지급 시각은 서버 값(myr_settlement_pay_at · 0101)
	const nextAt = $derived(pv.settleAt);
	const next = $derived({
		href: '/settle/next',
		title: `${monthShort(pv.month)} 정산`,
		short: monthShort(pv.month),
		payShort: `${shortDate(nextAt)} 지급 예정`,
		status: monthStatus({ upcoming: true, nextHold: st.nextHold }),
		held: pv.total.held,
		sales: pv.total.netSales,
		settle: pv.total.settle,
		offset: pv.total.offset,
		refund: pv.total.depositRefund,
		net: pv.total.payout
	});
	const months = $derived([
		next,
		...st.months.map((m) => ({
			href: `/settle/${m.month}`,
			title: `${monthShort(m.month)} 정산`,
			short: monthShort(m.month),
			payShort: `${shortDate(m.payAt)} 지급`,
			status: monthStatus({ upcoming: false, payoutStatus: m.payoutStatus, payoutLabel: m.payoutLabel }),
			held: m.total.held,
			sales: m.total.netSales,
			settle: m.total.settle,
			offset: m.total.offset,
			refund: m.total.depositRefund,
			net: m.total.payout
		}))
	]);
	// 남은 제조금액 합 · 돌려받을 보증금 합 · 다음 정산 상환 예정은 서버 값(0101) — 화면이 더하지 않는다
	const rightText = $derived(view === 'mfg' ? [`남은 제조금액 ${won(st.ledgerTotal.remaining)}`, `돌려받을 보증금 ${won(st.ledgerTotal.depositHeld)}`] : ['매월 1일 오후 1시 지급']);
	const ledgers = $derived(st.ledgers.map((l) => ({ l, c: ledgerCard(l, pv.month, won) })));

	const CHIP: Record<SettleTone, string> = {
		plan: 'bg-[#a8dcc8]/16 text-[#a8dcc8]',
		hold: 'bg-[#ff6b6b]/14 text-[#ff8a8a]',
		warn: 'bg-accent/16 text-accent',
		done: 'bg-white/6 text-white/50'
	};
	const segBtn = (on: boolean) => `flex h-10 items-center justify-center rounded-[10px] text-[14px] font-bold transition-all lg:h-[42px] lg:text-[15px] ${on ? 'bg-[#2a2c33] text-fg' : 'text-white/55'}`;
</script>

{#snippet seg()}
	<div class="grid grid-cols-2 gap-1 rounded-[14px] bg-white/5 p-1 lg:inline-grid lg:grid-cols-[180px_180px]" role="tablist" aria-label="정산 보기">
		<button type="button" role="tab" aria-selected={view === 'pay'} onclick={() => (view = 'pay')} class={segBtn(view === 'pay')}>정산 내역</button>
		<button type="button" role="tab" aria-selected={view === 'mfg'} onclick={() => (view = 'mfg')} class={segBtn(view === 'mfg')}>제조금액 · 보증금</button>
	</div>
{/snippet}

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<!-- 모바일 머리 -->
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:hidden">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em]">정산</h1>
		<span class="ml-3 min-w-0 text-right text-[12px] leading-[1.45] text-white/50">
			{#each rightText as t, i (t)}<span class="inline-block whitespace-nowrap">{i ? ` / ${t}` : t}</span>{/each}
		</span>
	</div>
	<div class="shrink-0 px-5 pb-2 lg:hidden">{@render seg()}</div>
	<!-- PC 머리 -->
	<div class="hidden items-center justify-between gap-4 lg:flex">
		{@render seg()}
		<span class="text-[14px] text-white/50">{rightText.join(' / ')}</span>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-8 lg:overflow-visible lg:p-0">
		{#if view === 'pay'}
			{#if st.nextHold?.code === 'settle_info'}<div class="mb-3 lg:mt-5 lg:mb-0"><SettleHold settleStatus={st.settleStatus} nextDate={shortDate(nextAt)} /></div>{/if}

			<!-- 다음 정산 -->
			<a href={next.href} class="relative block overflow-hidden rounded-3xl bg-panel p-5 text-fg lg:mt-5 lg:flex lg:items-center lg:gap-10 lg:px-7 lg:py-[26px]">
				<span class="pointer-events-none absolute -top-[70px] -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))] lg:-top-[90px] lg:right-auto lg:-left-20 lg:h-[280px] lg:w-[280px]"></span>
				<span class="relative block lg:min-w-[300px] lg:shrink-0">
					<span class="flex items-center justify-between gap-2 lg:justify-start">
						<span class="text-[12px] font-bold text-white/55 lg:text-[13px]">다음 정산 · {settleAtLabel(nextAt)}</span>
						<span class="text-[12px] font-extrabold text-accent lg:text-[13px]">{dDay(nextAt)}</span>
					</span>
					<span class="mt-1.5 flex items-center gap-2.5 lg:mt-2 lg:gap-3">
						<span class="text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[40px]">{won(next.net)}</span>
						<span class="shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-bold whitespace-nowrap lg:rounded-lg lg:px-2.5 lg:py-[5px] lg:text-[12px] {CHIP[next.status.tone]}">{next.status.label}</span>
						{#if next.held}<span class="shrink-0 rounded-[7px] px-2 py-1 text-[11px] font-bold whitespace-nowrap lg:rounded-lg lg:px-2.5 lg:py-[5px] lg:text-[12px] {CHIP.hold}">제조금액 확인 중 {next.held}</span>{/if}
					</span>
				</span>
				<span class="relative mt-4 flex gap-[22px] lg:mt-0 lg:flex-1 lg:gap-9 lg:border-l lg:border-white/8 lg:pl-10">
					{#each [{ k: '판매 금액', v: won(next.sales), c: '', pc: false }, { k: '정산금 (60%)', v: won(next.settle), c: '', pc: false }, { k: '제조금액 상계', v: won(next.offset), c: 'text-accent', pc: false }, { k: '보증금 환급', v: won(next.refund), c: '', pc: true }] as x (x.k)}
						<span class={x.pc ? 'hidden lg:block' : ''}>
							<span class="block text-[11px] text-white/50 lg:text-[12px]">{x.k}</span>
							<span class="mt-0.5 block text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px] {x.c}">{x.v}</span>
						</span>
					{/each}
				</span>
				<span class="relative hidden shrink-0 items-center gap-1 text-[14px] font-bold text-white/60 lg:flex">자세히 보기<Icon id="chev" size={14} sw={2.4} /></span>
			</a>

			<!-- 월별 정산 -->
			<h2 class="mt-6 text-[16px] font-extrabold tracking-[-0.02em] lg:mt-7 lg:text-[20px]">월별 정산</h2>
			<div class="mt-2.5 flex flex-col gap-2 lg:mt-3.5 lg:grid lg:grid-cols-2 lg:gap-3">
				{#each months as mo (mo.href)}
					<a href={mo.href} class="flex flex-col gap-2.5 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-fg transition-colors lg:gap-3 lg:rounded-[20px] lg:p-[18px] lg:hover:border-white/30">
						<span class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5">
								<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11px] font-bold whitespace-nowrap {CHIP[mo.status.tone]}">{mo.status.label}</span>
								{#if mo.held}<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11px] font-bold whitespace-nowrap {CHIP.hold}">제조금액 확인 중 {mo.held}</span>{/if}
							</span>
							<span class="text-[11px] text-white/45 lg:text-[12px]">{mo.payShort}</span>
						</span>
						<span class="flex items-center gap-3 lg:gap-3.5">
							<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/6 text-[13px] font-extrabold text-white/85 lg:h-[52px] lg:w-[52px] lg:rounded-[14px] lg:text-[14px]">{mo.short}</span>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-[3px]">
								<span class="text-[14px] font-bold lg:text-[15px]">{mo.title}</span>
								<span class="flex flex-wrap gap-x-1 text-[12px] leading-[1.45] text-white/55 lg:text-[13px]">
									<span class="whitespace-nowrap">판매 {won(mo.sales)}</span><span class="whitespace-nowrap">− 제조금액 상계 {won(mo.offset)}</span>
								</span>
							</span>
							<span class="text-[14px] font-extrabold whitespace-nowrap tabular-nums lg:text-[16px]">{won(mo.net)}</span>
						</span>
					</a>
				{/each}
			</div>
		{:else}
			<!-- 제조금액 · 보증금 -->
			<div class="flex flex-col gap-[5px] rounded-2xl border border-accent/20 bg-accent/7 px-4 py-3.5 text-[12px] lg:text-[13px] leading-[1.5] text-white/80 lg:mt-5 lg:gap-[7px] lg:rounded-[20px] lg:px-5 lg:py-[18px] lg:text-[14px]">
				{#each ['MYR이 먼저 낸 제조금액은 매달 정산금에서 나눠 상환해요', '제조금액이 모두 상계되면 보증금을 돌려드려요, 그 뒤 판매분부터는 정산금(판매의 60%)을 전액 지급해요'] as t (t)}
					<span class="flex items-start gap-2 lg:gap-2.5"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent lg:mt-2"></span><span>{t}</span></span>
				{/each}
			</div>
			<div class="mt-3 flex flex-col gap-2 lg:mt-5 lg:grid lg:grid-cols-2 lg:gap-3">
				{#each ledgers as { l, c } (l.product.id)}
					<div class="flex flex-col gap-2.5 rounded-[18px] border border-white/8 bg-white/3 p-3.5 lg:gap-3 lg:rounded-[20px] lg:p-[18px]">
						<span class="flex items-center justify-between gap-2">
							<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11px] font-bold whitespace-nowrap {CHIP[c.tone]}">{c.chip}</span>
							{#if l.hasLedger}<span class="text-[11px] text-white/45 lg:text-[12px]">제조금액 {won(l.total)}</span>{/if}
						</span>
						<span class="flex items-center gap-3 lg:gap-3.5">
							<Tile tile="slate" bg={l.product.tile} iconId={l.product.icon} thumbUrl={l.product.thumbUrl} icon={24} class="h-11 w-11 shrink-0 rounded-xl lg:h-[52px] lg:w-[52px] lg:rounded-[14px]" />
							<span class="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-[3px]">
								<span class="truncate text-[14px] font-bold lg:text-[15px]">{l.product.name}</span>
								<span class="text-[12px] text-white/55 lg:text-[13px]">{l.hasLedger ? c.depositText : '운영팀이 제조금액을 입력하면 정산이 확정돼요'}</span>
							</span>
							{#if l.hasLedger}
								<span class="text-right whitespace-nowrap">
									<span class="block text-[11px] text-white/45">남은 금액</span>
									<span class="block text-[14px] font-extrabold tabular-nums lg:text-[16px]">{won(l.remaining)}</span>
								</span>
							{/if}
						</span>
						{#if l.hasLedger}
							<span class="block">
								<span class="flex h-1.5 overflow-hidden rounded-[3px] bg-white/8" role="progressbar" aria-valuenow={c.paidPct} aria-valuemin={0} aria-valuemax={100} aria-label="상환한 비율">
									<span class={c.tone === 'done' ? 'bg-[#a8dcc8]' : 'bg-accent'} style:width="{c.paidPct}%"></span>
									<span class="bg-accent/40" style:width="{c.planPct}%"></span>
								</span>
								<span class="mt-2 flex items-center justify-between gap-2 text-[12px]">
									<span class="text-white/55">{c.paidPct}%</span>
									<span class="font-bold text-accent">{c.planText}</span>
								</span>
							</span>
						{/if}
					</div>
				{:else}
					<p class="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/45 lg:col-span-2">제조금액이 입력되면 여기에 남은 금액과 보증금이 보여요</p>
				{/each}
			</div>
		{/if}
	</div>
</div>
