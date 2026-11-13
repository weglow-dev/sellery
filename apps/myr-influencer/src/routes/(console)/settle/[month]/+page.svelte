<script lang="ts">
	import { goto } from '$app/navigation';
	import { itemsByProduct, monthShort, monthStatus, rowKey, settleAtLabel, shortDate, type SettleRow, type SettleTone } from '@sellery/myr-core/seller-settlement';
	import { won } from '$lib/rules';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import SettleTodo from '$lib/components/SettleTodo.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 정산 상세(0089 · 시안 "MYR Influencer Admin" · "… PC" SETTLEMENT DETAIL). `/settle/next` = 다음 정산(예상) · `/settle/YYYY-MM` = 확정된 회차.
	 *  상품별 내역(지급액 · 판매 · 정산금 · 상계 · 보증금 · 판매 내역 = 주문 줄 · 고객 이름 가림) · 정산 계산 · 지급 정보 · (다음 정산) 아직 포함되지 않은 판매.
	 *  보류 상품(제조금액 확인 중)은 지급액 대신 "—" + 한 줄 안내. 정산 뒤 환불이 있으면 정산 계산에 줄을 더한다.
	 *  보류 해제(0089): 지난 달 보류분이 이 정산에서 지급되면 같은 상품이라도 "○월분 · 보류 해제" 줄이 따로 생긴다. 원래 달 상세에는 "○월 정산에서 지급"으로 남고 합계에서 빠진다.
	 *  지급까지 할 일(시안 2026-11-13 · SettleTodo): 지급 전이면 ① 정산 정보 등록 ② 세금계산서 발행(0104 · 서버 myr_payout_invoice_json) — 지급은 세금계산서 확인 뒤라 날짜는 "정산일"(지급 완료면 이체한 날).
	 *  모바일: 60px 머리 · 상태 · 지급까지 할 일 → 정산 계산 → 상품별 내역 / PC(lg~): 32px 제목 · 왼쪽 지급까지 할 일 · 상품별 내역 + 오른쪽 420px sticky 정산 계산 · 지급 정보(보류 사유 · 세금계산서 상태) */
	let { data } = $props();
	const st = $derived(data.settle);
	const upcoming = $derived(data.key === 'next');
	const src = $derived(upcoming ? st.preview : st.months.find((m) => m.month === data.key)!);
	const month = $derived(upcoming ? st.preview.month : data.key);
	// 지급 시각은 서버 값(myr_settlement_pay_at · 0101)
	const mon = $derived(upcoming ? null : (st.months.find((m) => m.month === data.key) ?? null));
	const payAt = $derived(upcoming ? st.preview.settleAt : (mon?.payAt ?? null));
	// 지급 완료면 이체한 날(서버 paid_on · 0103) — 시각 없이 날짜만
	const paidOn = $derived(mon?.paidOn ?? null);
	// 세금계산서(0104) — 서버 값 그대로(show = 칸을 그린다)
	const inv = $derived(mon?.invoice?.show ? mon.invoice : null);
	// 상태 · 보류 이유는 서버 값(다음 정산 next_hold · 지난 회차 지급 건 payout_status · holds — 0102 · 0104). 이유가 여럿이면 전부 보여 준다
	const holds = $derived(upcoming ? (st.nextHold ? [st.nextHold] : []) : (mon?.holds ?? []));
	const holdText = $derived(holds.map((h) => h.label).join(', '));
	// 지급까지 할 일 ① — 사업자 · 정산 정보 이유가 있으면 아직(서버 코드로 고른다)
	const settleInfoHold = $derived(holds.some((h) => h.code === 'settle_info'));
	// 지급 완료(이체한 날이 있다)면 할 일 카드를 그리지 않는다 · 다음 정산 · 세금계산서가 있는 달 · 정산 정보가 걸린 달만
	const showTodo = $derived(!paidOn && (upcoming || !!inv || settleInfoHold));
	const status = $derived(upcoming ? monthStatus({ upcoming: true, nextHold: st.nextHold }) : monthStatus({ upcoming: false, payoutStatus: mon?.payoutStatus ?? null, payoutLabel: mon?.payoutLabel ?? '' }));
	const target = $derived(`${monthShort(month)} 배송 완료분`);
	// 이체 전이면 지급 예정 금액 · 지급 완료(이체한 날이 있다)면 지급액
	const totalLabel = $derived(paidOn ? '지급액' : '지급 예정 금액');
	const byProduct = $derived(itemsByProduct(data.items));
	const nextPay = $derived(shortDate(st.preview.settleAt));

	// 판매 내역(주문 줄) — 상품마다 기본 닫힘(2026-11-10) · 펼친 것만 기억
	let opened = $state<Record<string, boolean>>({});
	const kstDot = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(5, 10).replace('-', '.') : '—');

	const CHIP: Record<SettleTone, string> = {
		plan: 'bg-[#a8dcc8]/16 text-[#a8dcc8]',
		hold: 'bg-[#ff6b6b]/14 text-[#ff8a8a]',
		warn: 'bg-accent/16 text-accent',
		done: 'bg-white/6 text-white/50'
	};
	const stat = (r: SettleRow) => [
		{ k: '판매 금액', v: won(r.sales), c: '' },
		{ k: '정산금 (60%)', v: won(r.settle), c: '' },
		{ k: '제조금액 상계', v: r.offset ? `−${won(r.offset)}` : '—', c: r.offset ? 'text-accent' : 'text-white/35' },
		{ k: '보증금 환급', v: r.depositRefund ? `+${won(r.depositRefund)}` : '—', c: r.depositRefund ? 'text-[#a8dcc8]' : 'text-white/35' }
	];
	const calc = $derived(
		[
			{ k: '판매 금액', v: won(src.total.sales), c: 'text-fg', show: true },
			{ k: '정산 뒤 환불', v: `−${won(src.total.refundAdj)}`, c: 'text-[#ff8a8a]', show: src.total.refundAdj > 0 },
			{ k: '정산금 (판매의 60%)', v: won(src.total.settle), c: 'text-fg', show: true },
			{ k: '제조금액 상계', v: `−${won(src.total.offset)}`, c: 'text-accent', show: true },
			{ k: '보증금 환급', v: `+${won(src.total.depositRefund)}`, c: 'text-[#a8dcc8]', show: true }
		].filter((x) => x.show)
	);
</script>

{#snippet calcRows(big: boolean)}
	<div class="flex flex-col gap-2.5 text-[14px]">
		{#each calc as x (x.k)}
			<div class="flex justify-between text-white/60"><span>{x.k}</span><span class="font-semibold tabular-nums {x.c}">{x.v}</span></div>
		{/each}
		<div class="mt-1 flex items-baseline justify-between border-t border-white/8 pt-3">
			<span class="font-bold text-fg">{totalLabel}</span>
			<span class="font-extrabold text-accent tabular-nums {big ? 'text-[22px]' : 'text-[20px]'}">{won(src.total.payout)}</span>
		</div>
	</div>
{/snippet}

{#snippet heldNote(cls: string)}
	{#if src.total.held}<p class="text-[12px] leading-[1.6] text-[#ff8a8a] {cls}">제조금액 확인 중인 상품 {src.total.held}개는 합계에서 빠져 있어요. 금액이 정해지면 정산돼요.</p>{/if}
{/snippet}

{#snippet upcomingNote(cls: string)}
	{#if upcoming}<p class="text-[12px] leading-[1.6] text-white/45 {cls}">예상 금액이에요. 월말까지 환불·배송 상황에 따라 바뀔 수 있어요.</p>{/if}
{/snippet}

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="{monthShort(month)} 정산" fallback="/settle">
		{#snippet right()}<span class="text-[12px] text-white/45">{target}</span>{/snippet}
	</BackHeader>
	<!-- PC 제목 -->
	<div class="hidden items-center gap-3 lg:flex">
		<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">{monthShort(month)} 정산</h1>
		<span class="ml-auto flex items-center gap-2.5">
			<span class="rounded-lg px-3 py-1.5 text-[13px] font-bold whitespace-nowrap {CHIP[status.tone]}">{status.label}</span>
			<span class="text-[13px] text-white/45">{target}</span>
		</span>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-10 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
		<div class="min-w-0">
			<!-- 모바일 상태 줄 -->
			<div class="flex items-center gap-2 lg:hidden">
				<span class="rounded-lg px-2.5 py-[5px] text-[12px] font-bold whitespace-nowrap {CHIP[status.tone]}">{status.label}</span>
				<span class="ml-auto text-[12px] text-white/50">{paidOn ? `${shortDate(paidOn)} 지급` : `${settleAtLabel(payAt)} 정산${upcoming ? ' 예정' : ''}`}</span>
			</div>
			{#if holds.length}<p class="mt-2 text-[12px] leading-[1.5] text-white/55 lg:hidden">보류 사유 : {holdText}</p>{/if}
			{#if showTodo}
				<SettleTodo month={data.key} settleStatus={st.settleStatus} settleInfoDone={!settleInfoHold} {inv} depositRefund={src.total.depositRefund} {payAt} />
			{/if}

			<!-- 모바일 정산 계산 -->
			<div class="lg:hidden">
				<h3 class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70">정산 계산</h3>
				<div class="rounded-[20px] border border-white/8 bg-white/3 p-4">{@render calcRows(false)}</div>
				{@render heldNote('mt-2.5')}
				{@render upcomingNote('mt-2.5')}
			</div>

			<h3 class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70 lg:mt-0 lg:text-[15px]">상품별 내역</h3>
			<div class="flex flex-col gap-2 lg:gap-2.5">
				{#each src.rows as r (rowKey(r.product.code, r.origin))}
					{@const key = rowKey(r.product.code, r.origin)}
					{@const its = byProduct.get(key) ?? []}
					{@const open = !!opened[key]}
					<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:px-5 lg:py-[18px]">
						<div class="flex items-center gap-3 lg:gap-4">
							<Tile tile="slate" bg={r.product.tile} iconId={r.product.icon} thumbUrl={r.product.thumbUrl} icon={24} class="h-11 w-11 shrink-0 rounded-xl lg:h-14 lg:w-14 lg:rounded-2xl" />
							<span class="min-w-0 flex-1">
								<span class="block text-[14px] leading-[1.3] font-bold lg:text-[16px]">{r.product.name}</span>
								{#if r.origin}<span class="mt-2 inline-block rounded-md px-[7px] py-[2px] text-[11px] font-bold {CHIP.plan}">{monthShort(r.origin)}분 · 보류 해제</span>{/if}
								{#if r.releasedIn}<span class="mt-1 inline-block rounded-md px-[7px] py-[2px] text-[11px] font-bold {CHIP.done}">{monthShort(r.releasedIn)} 정산에서 지급</span>{/if}
								{#if r.nextPayout}<span class="mt-1 inline-block rounded-md px-[7px] py-[2px] text-[11px] font-bold {CHIP.plan}">다음 정산에서 지급</span>{/if}
							</span>
							<span class="text-right whitespace-nowrap">
								<span class="block text-[11px] text-white/50 lg:text-[12px]">지급액</span>
								{#if r.status === 'held'}
									<span class="mt-0.5 block text-[15px] font-extrabold text-white/35 lg:text-[18px]">—</span>
								{:else}
									<span class="mt-0.5 block text-[15px] font-extrabold tabular-nums lg:text-[18px] {r.counted ? '' : 'text-white/40'}">{won(r.payout ?? 0)}</span>
								{/if}
							</span>
						</div>
						{#if r.status === 'held'}
							<!-- 보류(제조금액 확인 중 · 입력됐으면 보류 해제 예정) — 머리 아래 한 줄로(2026-11-10) -->
							<div class="mt-3 flex items-center gap-2 rounded-xl py-1 lg:mt-3.5 lg:gap-2.5">
								<!-- 보류 줄인데 제조금액이 이미 들어왔으면 — 다음 정산 크론이 먼저 해제해 그때 지급한다(서버 releasable · myr_settlement_row_releasable) -->
								{#if r.releasable}
									<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11.5px] font-bold whitespace-nowrap {CHIP.plan}">보류 해제 예정</span>
									<span class="min-w-0 text-[12px] leading-[1.45] text-white/65 lg:text-[13px]">제조금액이 입력됐어요 ({nextPay} 정산에서 지급돼요)</span>
								{:else}
									<span class="shrink-0 rounded-md px-[7px] py-[3px] text-[11.5px] font-bold whitespace-nowrap {CHIP.hold}">제조금액 확인 중</span>
									<span class="min-w-0 text-[12px] leading-[1.45] text-white/65 lg:text-[13px]">운영팀이 제조금액을 입력하면 정산이 확정돼요</span>
								{/if}
							</div>
						{/if}
						<div class="mt-3.5 grid grid-cols-2 gap-3 border-t border-white/6 pt-3.5 lg:mt-4 lg:grid-cols-4 lg:pt-4">
							{#each stat(r) as x (x.k)}
								<div><span class="block text-[11px] text-white/50 lg:text-[12px]">{x.k}</span><span class="mt-[3px] block text-[14px] font-bold tabular-nums lg:text-[15px] {x.c}">{x.v}</span></div>
							{/each}
						</div>
						{#if its.length}
							<div class="mt-3.5 rounded-[14px] bg-white/3 lg:mt-4">
								<button type="button" onclick={() => (opened[key] = !open)} aria-expanded={open} class="flex h-11 w-full items-center justify-between px-3.5 text-[12px] font-bold text-white/70 lg:px-4 lg:text-[13px]">
									<span>판매 내역 {its.length}건</span>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
								</button>
								{#if open}
									<div class="px-3.5 pb-0.5 lg:px-4 lg:pb-1">
										{#each its as it, i (i)}
											<div class="flex items-center justify-between gap-3 border-t border-white/6 py-2.5 lg:py-3">
												<span class="min-w-0">
													<span class="block text-[12px] text-white/50 lg:text-[13px]"><b class="font-bold text-fg">{it.orderCode.toUpperCase()}</b> · {it.buyer} · 배송 완료 {kstDot(it.deliveredAt)}</span>
													<span class="mt-[3px] block text-[12px] text-white/75 tabular-nums lg:text-[13px]">
														{#if it.groupbuy}<span class="mr-1 rounded-[5px] bg-accent/14 px-1.5 py-px text-[11px] font-extrabold text-accent">공구</span>{/if}{it.qty}개 × {won(it.unitPrice)}{#if it.kind === 'refund_adj'}<span class="text-[#ff8a8a]">{` · 정산 뒤 환불`}</span>{:else if it.refunded}<span class="text-[#ff8a8a]">{` · 환불 −${won(it.refunded)}`}</span>{/if}
													</span>
												</span>
												<span class="shrink-0 text-[13px] font-bold tabular-nums lg:text-[14px] {it.kind === 'refund_adj' ? 'text-[#ff8a8a]' : ''}">{it.kind === 'refund_adj' ? `−${won(it.amount)}` : won(it.amount)}</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<p class="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/45">아직 정산할 판매가 없어요</p>
				{/each}
			</div>

			{#if upcoming && st.preview.undelivered.lines}
				<h3 class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70 lg:text-[15px]">아직 포함되지 않은 판매</h3>
				<div class="flex items-start gap-2 rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5 text-[13px] leading-[1.5] text-white/65">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
					<span>배송 완료 전 판매 <b class="font-bold text-fg">{st.preview.undelivered.lines}건 &nbsp;{won(st.preview.undelivered.amount)}</b> 은 배송이 완료되면 그 달 정산에 들어가요</span>
				</div>
			{/if}
		</div>

		<!-- PC 오른쪽 — 정산 계산 · 지급 정보 -->
		<aside class="hidden lg:sticky lg:top-8 lg:block">
			<div class="rounded-3xl border border-white/8 bg-panel p-6">
				<p class="mb-3.5 text-[16px] font-extrabold">정산 계산</p>
				{@render calcRows(true)}
				{@render heldNote('mt-3')}
				<p class="mt-[22px] mb-3 text-[14px] font-extrabold text-white/70">지급 정보</p>
				<div class="flex flex-col gap-2.5 text-[14px]">
					<div class="flex justify-between text-white/60"><span>{paidOn ? '지급일' : '정산일'}</span><span class="font-semibold text-fg tabular-nums">{paidOn ? shortDate(paidOn) : settleAtLabel(payAt)}</span></div>
					<div class="flex justify-between text-white/60"><span>정산 대상</span><span class="font-semibold text-fg">{target}</span></div>
					<div class="flex items-center justify-between text-white/60"><span>상태</span><span class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold whitespace-nowrap {CHIP[status.tone]}">{status.label}</span></div>
					{#if holds.length}
						<div class="flex justify-between gap-3 text-white/60">
							<span class="shrink-0">보류 사유</span>
							<span class="text-right font-semibold text-fg">{holdText}</span>
						</div>
					{/if}
				</div>
				{@render upcomingNote('mt-4')}
				<button type="button" onclick={() => goto('/settle')} class="mt-5 h-[54px] w-full rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg transition-colors hover:border-white/35">목록으로</button>
			</div>
		</aside>
	</div>
</div>
