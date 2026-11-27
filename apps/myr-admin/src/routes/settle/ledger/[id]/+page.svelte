<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { won } from '$lib/format';
	import { products } from '$lib/mock/products.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT } from '$lib/ui';
	import Chip from '$lib/components/Chip.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PanelBtn from '$lib/components/PanelBtn.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';

	/** 제조금액 원장 상세 — docs/myr-admin-screens.md §10-1(시안 "MYR Admin PC" · "MYR Admin" detail 'ledger' · 2026-11-27). 상품 관리 [원장 열기] · 정산 › 제조금액 원장 줄에서 연다.
	 *  머리(뒤로 · 사진 · "정산 · 제조금액 원장" · 상품명 · "제조금액 원장") · 왼쪽 요약 4칸 + 상계 막대 · 제조 차수 표(입력일 · 환급 · 메모) · 상계 이력(최근 회차부터)
	 *  · 오른쪽 상환 · 보증금 칩 · 크리에이터 · 판매 상태 · 안내 · [제조 차수 추가] · [정정].
	 *  보증금은 제조금액을 입력할 때 운영이 따로 받아 둔다(입금 확인 단계 없음). 모바일은 상태 칩이 제목 아래 · 정보 카드 · 안내 · 버튼이 맨 아래.
	 *  UI 단계 — 버튼 · 정정 창은 자리만(저장은 다음 단계). 숫자 · 칩 · 버튼 표시 조건은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(products.ledger(id));

	const back = () => (history.length > 1 ? history.back() : goto(`/products/${id}`));
	const soon = (what: string) => app.showToast(`${what}는 다음 단계에서 붙어요`);

	const REFUND_CLS = { dim: 'text-white/40', plain: 'text-fg', grey: 'text-white/60' } as const;
	// 표 열(시안) — 차수 · 입력일 · 환급 · 메모 · 제조금액 · 보증금
	const ROUND_COLS = 'grid-cols-[44px_92px_72px_minmax(0,1fr)_100px_100px]';
	const OFFSET_COLS = 'grid-cols-[90px_minmax(0,1fr)_120px_130px]';

	// [정정] 창(시안 ledFix) — 차수(살아 있는 차수 · 마지막이 기본) · 제조금액 · 메모(고른 차수 값으로 채움) · 한 번 더 확인
	let fixOpen = $state(false);
	let fixN = $state('');
	let amountIn = $state('');
	let memoIn = $state('');
	const fixable = $derived(v ? v.rounds.filter((r) => r.fix?.ok) : []);
	const chosen = $derived(fixable.find((r) => r.n === fixN) ?? null);
	const fmt = (s: string) => {
		const n = s.replace(/\D/g, '');
		return n ? Number(n).toLocaleString('ko-KR') : '';
	};
	const amountN = $derived(Number(amountIn.replace(/\D/g, '')) || 0);
	const pick = (n: string) => {
		const r = fixable.find((x) => x.n === n);
		if (!r) return;
		fixN = r.n;
		amountIn = r.amount.toLocaleString('ko-KR');
		memoIn = r.memoRaw ?? '';
	};
	const openFix = () => {
		pick(fixable[fixable.length - 1]?.n ?? '');
		fixOpen = true;
	};
	/** 바뀐 내용 한 줄 — "1차 · 제조금액 ₩600,000 → ₩650,000 · 메모 변경" */
	const changes = $derived.by(() => {
		if (!chosen) return [];
		const out: string[] = [];
		if (amountN && amountN !== chosen.amount) out.push(`제조금액 ${won(chosen.amount)} → ${won(amountN)}`);
		if (memoIn.trim() !== (chosen.memoRaw ?? '')) out.push('메모 변경');
		return out;
	});
</script>

{#snippet infoCard()}
	{#if v}
		<dl>
			<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">크리에이터</dt><dd class="min-w-0 truncate text-right font-semibold">{v.creator.name} {v.creator.handle}</dd></div>
			<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">판매 상태</dt><dd><Chip label={v.statusChip.label} tone={v.statusChip.tone} /></dd></div>
		</dl>
	{/if}
{/snippet}

{#snippet note()}
	{#if v}<p class="rounded-[14px] border border-white/8 bg-white/4 px-4 py-[13px] text-[13.5px] leading-normal font-semibold text-white/60">{v.note}</p>{/if}
{/snippet}

{#snippet buttons()}
	{#if v}
		<div class="flex flex-col gap-2">
			<div class="flex gap-2"><PanelBtn tone="primary" onclick={() => soon('제조 차수 추가')}>제조 차수 추가</PanelBtn></div>
			<div class="flex gap-2"><PanelBtn disabled={!v.can.fix} onclick={openFix}>정정</PanelBtn></div>
		</div>
	{/if}
{/snippet}

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
				<!-- 모바일만 상태 칩을 제목 아래에(PC 는 오른쪽 패널 머리) -->
				{#each v.chips as c (c.label)}<span class="lg:hidden"><Chip label={c.label} tone={c.tone} lg /></span>{/each}
				<span class="ml-1 text-[13px] text-white/50 lg:ml-0 lg:text-[14px]">제조금액 원장</span>
			</div>
		</div>

		<div class="mt-5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
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
								<span role="columnheader">차수</span><span role="columnheader">입력일</span><span role="columnheader">환급</span><span role="columnheader">메모</span><span role="columnheader" class="text-right">제조금액</span><span role="columnheader" class="text-right">보증금 (25%)</span>
							</div>
							{#each v.rounds as r (r.n)}
								<div role="row" class="grid {ROUND_COLS} min-h-14 items-center gap-x-4 border-b border-white/5 py-1.5 text-[14.5px] tabular-nums {r.void ? 'line-through opacity-45' : ''}">
									<span role="cell">{r.n}</span>
									<span role="cell">{r.entered}</span>
									<span role="cell" class={REFUND_CLS[r.refund.tone]}>{r.refund.label}</span>
									<span role="cell" class="truncate text-white/75">{r.memo}</span>
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

				<!-- 모바일 — 정보 카드 · 안내 · 버튼은 맨 아래(시안) -->
				<div class="flex flex-col gap-3.5 lg:hidden">
					<section class="rounded-3xl border border-white/8 bg-white/3 p-5">{@render infoCard()}</section>
					{@render note()}
					{@render buttons()}
				</div>
			</div>

			<!-- 오른쪽 패널(PC) — 상환 · 보증금 칩 · 크리에이터 · 판매 상태 · 안내 · 버튼 -->
			<aside class="hidden flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-6 lg:sticky lg:top-7 lg:flex">
				<div>
					<div class="mb-3.5 flex flex-wrap items-center gap-2">{#each v.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}</div>
					{@render infoCard()}
				</div>
				{@render note()}
				{@render buttons()}
			</aside>
		</div>
	</div>
{/if}

{#if v && fixOpen}
	<Modal
		title="정정"
		desc="{v.name} · {v.creator.name}"
		ok="정정"
		sure="정말 정정하기"
		sureKind="primary"
		sureInfo={chosen && changes.length ? `${chosen.n} · ${changes.join(' · ')}` : undefined}
		info="금액을 정정하면 보증금과 남은 제조금액을 다시 계산해요"
		infoTone="grey"
		disabled={!chosen || !amountN || !changes.length}
		onclose={() => (fixOpen = false)}
		onok={() => {
			fixOpen = false;
			soon('정정 저장');
		}}
	>
		<div class="flex flex-col gap-1.5">
			<p class="text-[13px] font-semibold text-white/80">차수</p>
			<div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="차수">
				{#each fixable as r (r.n)}
					<button type="button" role="radio" aria-checked={fixN === r.n} onclick={() => pick(r.n)} class="h-[42px] rounded-xl border px-[15px] text-[13.5px] font-semibold transition-colors {fixN === r.n ? 'border-accent bg-accent/12 text-accent' : 'border-white/12 text-white/70 hover:border-white/30'}">{r.n}</button>
				{/each}
			</div>
		</div>
		<Field label="제조금액" hint={chosen ? products.fixHint(chosen.amount, amountIn) : undefined}>
			<div class="relative">
				<span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-bold text-white/55">₩</span>
				<input value={amountIn} oninput={(e) => (amountIn = fmt(e.currentTarget.value))} inputmode="numeric" class="{INPUT} pl-9 font-bold tabular-nums" />
			</div>
		</Field>
		<Field label="메모">
			<input bind:value={memoIn} maxlength="40" placeholder="예: 초도 2,000포" class={INPUT} />
		</Field>
	</Modal>
{/if}
