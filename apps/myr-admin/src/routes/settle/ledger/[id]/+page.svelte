<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { products } from '$lib/mock/products.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT, TEXTAREA } from '$lib/ui';
	import Btn from '$lib/components/Btn.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';

	/** 제조금액 원장 상세 — docs/myr-admin-screens.md §10-1 · 시안 "MYR Admin PC" 원장(상품 관리 [원장 열기] · 정산 › 제조금액 원장 줄에서 연다).
	 *  머리(뒤로 · 사진 · 상품명 · "크리에이터 · 제조금액 원장") · 왼쪽 요약 4칸 + 상계 막대 · 제조 차수 표 · 상계 이력(최근 회차부터)
	 *  · 오른쪽 원장 정보(상환 · 보증금 칩 · 상품 · 크리에이터 · 판매 상태) · 안내 · 버튼 두 개 [제조 차수 추가] · [금액 정정].
	 *  금액 정정 창에서 차수를 고른다(무효된 차수는 빠지고 보증금을 돌려준 차수는 고를 수 없음 · 사유 필수).
	 *  무효 · 보증금 입금 확인은 화면에 두지 않는다(2026-11-25 · 운영 스크립트 mfg-void · mfg-deposit).
	 *  UI 단계 — 버튼 · 정정 창은 자리만(저장은 다음 단계). 숫자 · 칩 · 버튼 표시 조건은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(products.ledger(id));

	const back = () => (history.length > 1 ? history.back() : goto(`/products/${id}`));
	const soon = (what: string) => app.showToast(`${what}는 다음 단계에서 붙어요`);

	const REFUND_CLS = { dim: 'text-white/40', plain: 'text-fg', grey: 'text-white/60' } as const;
	// 표 열(시안) — 차수 · 입금 확인일 · 환급 · 메모 · 입력자 · 제조금액 · 보증금
	const ROUND_COLS = 'grid-cols-[44px_92px_72px_minmax(0,1fr)_100px_100px]';

	// 금액 정정 창 — 차수 고르기(서버 fix: 무효면 빠짐 · 보증금 환급이면 못 고름) · 올바른 금액 · 사유
	let fixOpen = $state(false);
	let fixN = $state('');
	let amountIn = $state('');
	let reason = $state('');
	const fixable = $derived(v ? v.rounds.filter((r) => r.fix) : []);
	const chosen = $derived(fixable.find((r) => r.n === fixN && r.fix?.ok) ?? null);
	const openFix = () => {
		fixN = fixable.find((r) => r.fix?.ok)?.n ?? '';
		amountIn = '';
		reason = '';
		fixOpen = true;
	};
	const OFFSET_COLS = 'grid-cols-[90px_minmax(0,1fr)_120px_130px]';
</script>

{#if !v}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">제조 원장이 없어요</p>
		<p class="mt-1.5 text-[14px] text-white/55">아직 제조금액을 입력하지 않은 상품이에요</p>
		<a href="/products/{id}" class="mt-3 inline-block text-[14px] font-bold text-accent">상품으로 돌아가기</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-16">
		<!-- 머리 -->
		<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:min-h-[52px] lg:flex-nowrap">
			<button type="button" onclick={back} aria-label="뒤로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></button>
			<ProductThumb tile={v.tile} icon={v.icon} size={48} radius={14} />
			<div class="min-w-0 flex-1 lg:flex-none">
				<p class="text-[12.5px] font-semibold text-white/50">정산 · 제조금액 원장</p>
				<h1 class="truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{v.name}</h1>
			</div>
			<span class="hidden flex-1 lg:block"></span>
			<div class="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
				{#each v.chips as c (c.label)}<Chip label={c.label} tone={c.tone} lg />{/each}
				<span class="ml-1 text-[13px] text-white/50 lg:text-[14px]">{v.creator.name} · 제조금액 원장</span>
			</div>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<!-- 요약 4칸 + 상계 막대 -->
				<section class="rounded-3xl border border-white/8 bg-white/3 p-5 lg:p-6" aria-label="원장 요약">
					<dl class="grid grid-cols-2 gap-x-[18px] gap-y-3.5 sm:grid-cols-4">
						{#each v.stats as s (s.k)}
							<div>
								<dt class="text-[13px] text-white/50">{s.k}</dt>
								<dd class="mt-[5px] text-[20px] font-extrabold tracking-[-0.01em] tabular-nums lg:text-[22px] {s.hot ? 'text-[#ff9a66]' : ''}">{s.v}</dd>
							</div>
						{/each}
					</dl>
					<div class="mt-4 flex items-center gap-2.5">
						<span class="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/9"><span class="block h-full rounded-[3px] bg-accent" style:width="{v.pct}%"></span></span>
						<span class="shrink-0 text-[12.5px] font-semibold text-white/60 tabular-nums">{v.barText}</span>
					</div>
				</section>

				<!-- 제조 차수 -->
				<section class="rounded-3xl border border-white/8 bg-white/3 p-5 lg:p-6">
					<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">제조 차수</h2>
					<div class="no-bar -mx-5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
						<div class="min-w-[560px]" role="table" aria-label="제조 차수">
							<div role="row" class="grid {ROUND_COLS} items-end gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] leading-[1.3] font-semibold text-white/50">
								<span role="columnheader">차수</span><span role="columnheader">입금 확인일</span><span role="columnheader">환급</span><span role="columnheader">메모 · 입력자</span><span role="columnheader" class="text-right">제조금액</span><span role="columnheader" class="text-right">보증금 (25%)</span>
							</div>
							{#each v.rounds as r (r.n)}
								<div role="row" class="grid {ROUND_COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] tabular-nums {r.void ? 'line-through opacity-45' : ''}">
									<span role="cell">{r.n}</span>
									<span role="cell" class={r.deposit.wait ? 'font-semibold text-danger-fg' : ''}>{r.deposit.label}</span>
									<span role="cell" class={REFUND_CLS[r.refund.tone]}>{r.refund.label}</span>
									<span role="cell" class="truncate text-white/60">{r.memo}</span>
									<span role="cell" class="text-right font-bold">{r.amountText}</span>
									<span role="cell" class="text-right">{r.depositText}</span>
								</div>
							{/each}
						</div>
					</div>
				</section>

				<!-- 상계 이력 -->
				<section class="rounded-3xl border border-white/8 bg-white/3 p-5 lg:p-6">
					<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">상계 이력</h2>
					<div class="no-bar -mx-5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
						<div class="min-w-[440px]" role="table" aria-label="상계 이력">
							<div role="row" class="grid {OFFSET_COLS} items-end gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] leading-[1.3] font-semibold text-white/50">
								<span role="columnheader">정산월</span><span role="columnheader">내용</span><span role="columnheader" class="text-right">상계</span><span role="columnheader" class="text-right">남은 제조금액</span>
							</div>
							{#each v.offsets as o (o.month)}
								<div role="row" class="grid {OFFSET_COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] whitespace-nowrap tabular-nums">
									<span role="cell">{o.month}</span>
									<span role="cell" class="truncate text-white/60">{o.text}</span>
									<span role="cell" class="text-right font-semibold">{o.amountText}</span>
									<span role="cell" class="text-right">{o.afterText}</span>
								</div>
							{/each}
						</div>
					</div>
					{#if !v.offsets.length}<p class="pt-[22px] pb-2 text-center text-[13.5px] leading-normal text-white/55">{v.offsetsEmpty}</p>{/if}
				</section>
			</div>

			<!-- 오른쪽 패널 — 원장 정보 · 안내 · 버튼 -->
			<aside class="flex flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-5 lg:sticky lg:top-7 lg:p-6">
				<div>
					<div class="mb-3.5 flex flex-wrap items-center gap-2">
						<h2 class="text-[17px] font-extrabold tracking-[-0.01em]">원장</h2>
						{#each v.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}
					</div>
					<dl>
						<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">상품</dt><dd class="min-w-0 truncate text-right font-semibold">{v.name}</dd></div>
						<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">크리에이터</dt><dd class="min-w-0 truncate text-right font-semibold">{v.creator.name} {v.creator.handle}</dd></div>
						<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">판매 상태</dt><dd><Chip label={v.statusChip.label} tone={v.statusChip.tone} /></dd></div>
					</dl>
				</div>
				<p class="rounded-[14px] border border-white/8 bg-white/4 px-4 py-[13px] text-[13.5px] leading-normal font-semibold text-white/60">{v.note}</p>
				<div class="flex flex-col gap-2">
					<Btn kind="primary" full onclick={() => soon('제조 차수 추가')}>제조 차수 추가</Btn>
					<Btn kind="ghost" full disabled={!v.can.fix} onclick={openFix}>금액 정정</Btn>
				</div>
			</aside>
		</div>
	</div>
{/if}

{#if v && fixOpen}
	<Modal
		title="금액 정정"
		desc={chosen ? `${v.name} · ${chosen.n} · 지금 ${chosen.amountText}` : v.name}
		ok="정정"
		info="올바른 금액으로 새 차수를 만들고 고른 차수는 무효로 남겨요 · 이미 상계한 금액은 그대로예요{chosen && !chosen.deposit.wait ? ' · 보증금 입금 확인일도 새 차수로 옮겨요' : ''}"
		disabled={!chosen || !amountIn.trim() || !reason.trim()}
		onclose={() => (fixOpen = false)}
		onok={() => {
			fixOpen = false;
			soon('금액 정정 저장');
		}}
	>
		<Field label="고칠 차수">
			<span class="relative block">
				<select bind:value={fixN} class="{INPUT} appearance-none pr-10">
					{#each fixable as r (r.n)}
						<option value={r.n} disabled={!r.fix?.ok}>{r.n} · {r.amountText} · {r.memo}{r.fix?.ok ? '' : ` — ${r.fix?.why}`}</option>
					{/each}
				</select>
				<span class="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-white/55"><Icon id="down" size={14} sw={2.2} /></span>
			</span>
		</Field>
		<Field label="올바른 제조금액">
			<input bind:value={amountIn} inputmode="numeric" placeholder="예: 800,000" class={INPUT} />
		</Field>
		<Field label="정정 사유" count="{reason.length}/200">
			<textarea bind:value={reason} rows="3" maxlength="200" placeholder="무엇을 잘못 넣었는지 적어 주세요" class={TEXTAREA}></textarea>
		</Field>
	</Modal>
{/if}
