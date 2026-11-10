<script lang="ts">
	import {
		depositLabel,
		monthLabel,
		payoutHold,
		repaidPct,
		SETTLE_ROW_META,
		settleAtLabel,
		settleRowText,
		type SettleItem,
		type SettleRow
	} from '@sellery/myr-core/seller-settlement';
	import { won } from '$lib/rules';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 정산(0089 · 작업 순서 6 · 시안 없음 — 홈 · 주문 카드에 맞춤). 계산은 DB(0087 · 0089) — 여기는 보여 주기만.
	 *  ① 다음 정산 예정(예상 · 다음 회차를 지금 돌리면 나올 값) ② 월별 정산 내역(확정 · 보류 · 펼치면 상품 → 주문 줄) ③ 제품별 제조 원장(남은 제조금액 · 보증금).
	 *  사업자 · 정산 정보 확인 전이면 지급 보류 배너(계산 · 확정은 된다). 지급 완료 · 세금계산서는 작업 순서 7.
	 *  모바일: 한 줄 · PC(lg~): 1240px · 왼쪽(예상 · 월별) + 오른쪽 380px(제조 원장) */
	let { data } = $props();
	const st = $derived(data.settle);
	const pv = $derived(st.preview);
	const hold = $derived(payoutHold(st.settleStatus));

	let open = $state<Record<string, boolean>>({});
	let items = $state<Record<string, SettleItem[] | 'loading' | 'error'>>({});
	async function loadItems(month: string) {
		if (items[month] && items[month] !== 'error') return;
		items[month] = 'loading';
		try {
			const res = await fetch(`/api/settle/items?month=${month}`);
			// 서버(/api/settle/items)가 이미 화면 모양(SettleItem)으로 바꿔 보낸다
			const r = (await res.json().catch(() => null)) as { ok?: boolean; items?: SettleItem[] } | null;
			items[month] = r?.ok && Array.isArray(r.items) ? r.items : 'error';
		} catch {
			items[month] = 'error';
		}
	}

	const chip = (tone: string) => (tone === 'ok' ? 'bg-mint/14 text-mint' : tone === 'warn' ? 'bg-[#ff6b6b]/14 text-[#ff8a8a]' : 'bg-white/8 text-white/60');
	const minus = (n: number) => (n ? `−${won(n)}` : won(0));
	const kstDate = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(5, 10).replace('-', '.') : '—');
</script>

{#snippet rowLine(r: SettleRow)}
	<li class="flex items-center gap-3 py-2.5">
		<Tile tile="slate" bg={r.product.tile} iconId={r.product.icon} thumbUrl={r.product.thumbUrl} icon={22} class="h-10 w-10 shrink-0 rounded-xl" />
		<span class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span class="truncate text-[14px] font-bold">{r.product.name}</span>
			<span class="text-[12px] text-white/50 tabular-nums">{settleRowText(r, won)}</span>
		</span>
		{#if r.status === 'held'}
			<span class="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-bold {chip('warn')}">보류</span>
		{:else}
			<span class="shrink-0 text-[15px] font-extrabold tabular-nums">{won(r.payout ?? 0)}</span>
		{/if}
	</li>
{/snippet}

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">정산</h1>
		<span class="text-[12px] text-white/50 lg:text-[14px]">매월 1일 오후 1시 · 지난달 배송 완료분</span>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-8 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex min-w-0 flex-col gap-3 lg:gap-4">
			{#if hold}
				<a href="/my" class="flex items-center gap-3 rounded-2xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/10 px-4 py-3">
					<span class="min-w-0 flex-1 text-[13px] leading-[1.5] font-semibold text-[#ff8a8a]">{hold} — 내 정보에서 확인해 주세요</span>
					<Icon id="chev" size={16} sw={2.4} class="shrink-0 text-[#ff8a8a]" />
				</a>
			{/if}

			<!-- ① 다음 정산 예정 -->
			<section class="relative overflow-hidden rounded-3xl bg-panel p-5 lg:px-7 lg:py-[26px]" aria-label="다음 정산 예정">
				<div class="pointer-events-none absolute -top-[70px] -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))]"></div>
				<p class="relative text-[12px] font-bold text-white/55 lg:text-[13px]">다음 정산 예정{pv.settleAt ? ` · ${settleAtLabel(pv.settleAt)}` : ''}</p>
				<p class="relative mt-1.5 text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[40px]">{won(pv.total.payout)}</p>
				<div class="relative mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
					{#each [{ k: '판매', v: won(pv.total.sales - pv.total.refundAdj) }, { k: '정산금(60%)', v: won(pv.total.settle) }, { k: '제조금액 상계', v: minus(pv.total.offset) }, { k: '보증금 환급', v: won(pv.total.depositRefund) }] as x (x.k)}
						<div><p class="text-[11px] text-white/50 lg:text-[12px]">{x.k}</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:text-[17px]">{x.v}</p></div>
					{/each}
				</div>
				{#if pv.rows.length}
					<ul class="relative mt-4 flex flex-col divide-y divide-white/6 border-t border-white/8">
						{#each pv.rows as r (r.product.id)}{@render rowLine(r)}{/each}
					</ul>
				{/if}
				{#if pv.total.held}
					<p class="relative mt-3 text-[12px] leading-[1.5] text-[#ff8a8a]">제조금액 확인 중인 제품 {pv.total.held}개는 운영팀이 제조금액을 넣으면 정산돼요(합계에서 빠져 있어요)</p>
				{/if}
				{#if pv.undelivered.lines}
					<p class="relative mt-2 text-[12px] leading-[1.5] text-white/55">배송 완료 전 판매 {pv.undelivered.lines}건 · {won(pv.undelivered.amount)}는 배송 완료되면 그 달 정산에 들어가요</p>
				{/if}
				{#if !pv.rows.length && !pv.undelivered.lines}
					<p class="relative mt-3 text-[13px] text-white/50">아직 정산할 판매가 없어요</p>
				{/if}
			</section>

			<!-- ② 월별 정산 내역 -->
			<section aria-label="월별 정산 내역">
				<h2 class="mt-4 mb-2.5 text-[14px] font-extrabold text-white/80 lg:mt-2 lg:text-[15px]">월별 정산 내역</h2>
				{#if st.months.length}
					<ul class="flex flex-col gap-2.5">
						{#each st.months as m (m.month)}
							{@const isOpen = !!open[m.month]}
							{@const its = items[m.month]}
							<li class="rounded-[18px] border border-white/8 bg-white/3 lg:rounded-[20px]">
								<button type="button" onclick={() => (open[m.month] = !isOpen)} aria-expanded={isOpen} class="flex w-full items-center gap-3 p-4 text-left lg:p-[18px]">
									<span class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="flex items-center gap-2">
											<span class="text-[15px] font-extrabold">{monthLabel(m.month)} 정산</span>
											{#if m.total.held}<span class="rounded-md px-1.5 py-0.5 text-[11px] font-bold {chip('warn')}">보류 {m.total.held}</span>{/if}
										</span>
										<span class="text-[12px] text-white/50 tabular-nums">{[`정산금 ${won(m.total.settle)}`, m.total.offset ? `상계 ${minus(m.total.offset)}` : '', m.total.depositRefund ? `보증금 +${won(m.total.depositRefund)}` : ''].filter(Boolean).join(' · ')}</span>
									</span>
									<span class="text-right">
										<span class="block text-[11px] text-white/45">지급액</span>
										<span class="block text-[17px] font-extrabold tabular-nums">{won(m.total.payout)}</span>
									</span>
									<Icon id="chev" size={16} sw={2.4} class="shrink-0 text-white/40 transition-transform {isOpen ? 'rotate-90' : ''}" />
								</button>
								{#if isOpen}
									<div class="border-t border-white/8 px-4 pb-4 lg:px-[18px]">
										<ul class="flex flex-col divide-y divide-white/6">
											{#each m.rows as r (r.product.id)}{@render rowLine(r)}{/each}
										</ul>
										{#if its === undefined}
											<button type="button" onclick={() => loadItems(m.month)} class="mt-2 h-10 w-full rounded-xl border border-white/12 text-[13px] font-bold text-fg hover:bg-white/4">주문 줄 보기</button>
										{:else if its === 'loading'}
											<p class="mt-3 text-center text-[13px] text-white/50">불러오는 중…</p>
										{:else if its === 'error'}
											<button type="button" onclick={() => loadItems(m.month)} class="mt-2 h-10 w-full rounded-xl border border-white/12 text-[13px] font-bold text-[#ff8a8a]">불러오지 못했어요 · 다시 시도</button>
										{:else}
											<ul class="mt-2 flex flex-col gap-1.5 rounded-xl bg-white/4 p-3">
												{#each its as it, i (i)}
													<li class="flex items-start justify-between gap-3 text-[12.5px] leading-[1.45]">
														<span class="min-w-0">
															<span class="font-bold">{it.orderCode.toUpperCase()}</span>
															<span class="text-white/50"> · {it.buyer} · 배송 완료 {kstDate(it.deliveredAt)}</span>
															<span class="block truncate text-white/70">{#if it.groupbuy}<span class="mr-1 rounded-[5px] bg-accent/14 px-1.5 py-px text-[11px] font-extrabold text-accent">공구</span>{/if}{it.product}{it.option ? ` · ${it.option}` : ''} × {it.qty} · {won(it.unitPrice)}{it.refunded ? ` · 환불 −${won(it.refunded)}` : ''}</span>
														</span>
														<span class="shrink-0 font-bold tabular-nums {it.kind === 'refund_adj' ? 'text-[#ff8a8a]' : ''}">{it.kind === 'refund_adj' ? `정산 뒤 환불 ${minus(it.amount)}` : won(it.amount)}</span>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/45">첫 정산은 다음 달 1일 오후 1시에 확정돼요</p>
				{/if}
			</section>
		</div>

		<!-- ③ 제품별 제조 원장 -->
		<section class="mt-7 lg:mt-0" aria-label="제조 원장">
			<h2 class="mb-2.5 text-[14px] font-extrabold text-white/80 lg:text-[15px]">제조금액 · 보증금</h2>
			{#if st.ledgers.length}
				<ul class="flex flex-col gap-2.5">
					{#each st.ledgers as l (l.product.id)}
						<li class="rounded-[18px] border border-white/8 bg-white/3 p-4">
							<div class="flex items-center gap-3">
								<Tile tile="slate" bg={l.product.tile} iconId={l.product.icon} thumbUrl={l.product.thumbUrl} icon={22} class="h-10 w-10 shrink-0 rounded-xl" />
								<span class="min-w-0 flex-1 truncate text-[14px] font-bold">{l.product.name}</span>
							</div>
							{#if !l.hasLedger}
								<p class="mt-3 rounded-xl bg-[#ff6b6b]/10 px-3 py-2 text-[12.5px] leading-[1.5] text-[#ff8a8a]">제조금액 확인 중 — 운영팀이 입력하면 이 제품의 정산이 확정돼요</p>
							{:else}
								<div class="mt-3 flex items-baseline justify-between">
									<span class="text-[12px] text-white/50">남은 제조금액</span>
									<span class="text-[18px] font-extrabold tabular-nums">{won(l.remaining)}</span>
								</div>
								<div class="mt-2 h-2 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={repaidPct(l)} aria-valuemin={0} aria-valuemax={100} aria-label="갚은 비율">
									<div class="h-full rounded-full bg-accent" style:width="{repaidPct(l)}%"></div>
								</div>
								<p class="mt-2 text-[12px] text-white/55 tabular-nums">
									제조금액 {won(l.total)}{l.batches.length > 1 ? ` (${l.batches.length}차까지)` : ''} · 상계 {won(l.offset)} · {repaidPct(l)}% 갚음
								</p>
								<p class="mt-1 text-[12px] text-white/55">보증금 {depositLabel(l, won)}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/45">제조금액이 입력되면 여기에 남은 금액과 보증금이 보여요</p>
			{/if}
		</section>
	</div>
</div>
