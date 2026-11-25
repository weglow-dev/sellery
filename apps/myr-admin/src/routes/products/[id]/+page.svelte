<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { products } from '$lib/mock/products.svelte';
	import { PRODUCT_ART, PRODUCT_TILES } from '$lib/product-art';
	import { app } from '$lib/state.svelte';
	import { INPUT } from '$lib/ui';
	import Chip from '$lib/components/Chip.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PanelBtn from '$lib/components/PanelBtn.svelte';
	import PreviewBox from '$lib/components/PreviewBox.svelte';
	import PreviewCard from '$lib/components/PreviewCard.svelte';
	import PreviewSec from '$lib/components/PreviewSec.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';
	import ReviewHead from '$lib/components/ReviewHead.svelte';
	import ReviewInfo from '$lib/components/ReviewInfo.svelte';
	import ReviewPanel from '$lib/components/ReviewPanel.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import type { SecNo } from '$lib/mock/types';

	/** 상품 상세 — docs/myr-admin-screens.md §4-2 신규 심사 · §4-4 상품 관리(시안 "MYR Admin PC" 상품 · 2026-11-25).
	 *  신규 심사: 검수 정보 줄 · 샵 상세 미리보기(01 기본 정보 · 구매 패널 → 02 레시피 노트 → 03~07 · 칸마다 [의견 달기]) · 오른쪽 의견 패널([반려] · [승인 → 처음 재고 · 제조금액]).
	 *  상품 관리: 상품 정보 · 수정 심사 안내 · 제조금액 원장 · 보낸 의견 · 처리 이력 / 오른쪽 상태 · [재고 수정] · [일시중지]/[다시 판매] · [판매 종료].
	 *  상품 심사는 PC 에서만(§3 모바일) — 모바일(시안 "MYR Admin")은 안내 · 검수 정보 표 · 미리보기만. 상품 관리 모바일은 상태 · 버튼이 위. 문구 · 버튼 · 거절은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const rv = $derived(products.review(id));
	const v = $derived(rv ? null : products.view(id));
	const BACK_TAB: Record<string, string> = { live: 'live', paused: 'live', ended: 'ended' };
	const backHref = $derived(`/products?tab=${(v && BACK_TAB[v.status]) || 'review'}`);

	let panel = $state<ReturnType<typeof ReviewPanel>>();
	let ph = $state(0);
	/** 한 번 더 확인 중인 버튼 — 일시중지 · 판매 종료(첫 클릭에 [취소] [정말 ○○하기] + 아래 안내) */
	let armed = $state<'pause' | 'end' | null>(null);
	let modal = $state<'approve' | 'stock' | 'ledger' | null>(null);
	let stockIn = $state('');
	let amountIn = $state('');
	let memoIn = $state('');
	$effect(() => {
		void id;
		ph = 0;
		armed = null;
		modal = null;
	});
	const photo = $derived(rv ? rv.photos[Math.min(ph, rv.photos.length - 1)] : null);
	const turn = (d: number) => rv && (ph = (ph + d + rv.photos.length) % rv.photos.length);

	const addOp = (k: SecNo) => {
		products.addOp(id, k);
		panel?.focusSel();
	};
	const open = (m: 'approve' | 'stock' | 'ledger') => {
		stockIn = m === 'stock' && v?.stock != null ? String(v.stock) : '';
		amountIn = '';
		memoIn = '';
		modal = m;
	};
	function done(r: { ok: boolean; msg: string }, to?: string) {
		if (!r.ok) return r.msg;
		app.showToast(r.msg);
		modal = null;
		if (to) goto(to);
	}
	function end() {
		app.showToast(products.end(id));
		armed = null;
	}
	function pause() {
		app.showToast(products.pause(id));
		armed = null;
	}
	const approveHints = $derived(products.approveHints(stockIn, amountIn));
	const stockHint = $derived(products.stockHint(stockIn));
</script>

{#snippet hero(bg: string, icon: string, slides: boolean)}
	<div class="relative flex h-[200px] items-center justify-center rounded-[18px] text-fg lg:h-[240px]" style:background={bg}>
		<svg width="76" height="76" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html PRODUCT_ART[icon] ?? ''}</svg>
		{#if slides && rv}
			<button type="button" onclick={() => turn(-1)} aria-label="이전 사진" class="absolute top-1/2 left-2.5 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-full bg-bg/50 hover:bg-bg/75"><Icon id="back" size={16} sw={2.4} /></button>
			<button type="button" onclick={() => turn(1)} aria-label="다음 사진" class="absolute top-1/2 right-2.5 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-full bg-bg/50 hover:bg-bg/75"><Icon id="chev" size={16} sw={2.4} /></button>
			<span class="absolute top-3 right-3 rounded-full bg-bg/55 px-2.5 py-[5px] text-[12px] font-bold tabular-nums">{ph + 1} / {rv.photos.length}</span>
		{/if}
		<div class="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
			{#each rv?.tags ?? [] as t (t)}<span class="rounded-full bg-bg/55 px-2.5 py-[5px] text-[12px] font-bold">{t}</span>{/each}
		</div>
	</div>
{/snippet}

{#if rv && photo}
	<!-- ───────── 신규 심사 ───────── -->
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<ReviewHead r={rv} label="신규 심사" backHref="/products?tab=review" />
		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<ReviewInfo r={rv} />
				<PreviewCard right={rv.shopName} cat={rv.cat} name={rv.name}>
					<PreviewBox box={rv.basic} onop={() => addOp(1)}>
						{@render hero(PRODUCT_TILES[photo.tile], photo.icon, rv.photos.length > 1)}
						{#if rv.photos.length > 1}
							<div class="mt-2.5 flex flex-wrap gap-2">
								{#each rv.photos as p, n (p.label)}
									<button type="button" onclick={() => (ph = n)} aria-label={p.label} class="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[14px] border-2 text-fg transition hover:opacity-100 {n === ph ? 'border-accent' : 'border-transparent opacity-55'}" style:background={PRODUCT_TILES[p.tile]}>
										<svg width="24" height="24" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html PRODUCT_ART[p.icon] ?? ''}</svg>
										{#if p.main}<span class="absolute top-1 left-1 rounded-md bg-bg/62 px-[5px] py-0.5 text-[10px] leading-[1.2] font-extrabold">대표</span>{/if}
									</button>
								{/each}
							</div>
							<p class="mt-2 text-[12px] leading-[1.5] text-white/45">{rv.photoNote}</p>
						{/if}
						<div class="mt-4 flex items-center gap-2">
							<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-bg" style:background={rv.cr.bg}>{rv.cr.initial}</span>
							<span class="text-[14px] font-extrabold">{rv.cr.name}</span>
							<span class="text-[13px] text-white/50">{rv.cr.handle}</span>
						</div>
						<p class="mt-2.5 text-[22px] leading-[1.3] font-extrabold tracking-[-0.02em]">{rv.name}</p>
						<p class="mt-2 flex items-baseline gap-2"><span class="text-[22px] font-extrabold tracking-[-0.02em] tabular-nums">{rv.priceText}</span><span class="text-[13px] text-white/50">{rv.unit}</span></p>
					</PreviewBox>
					{#each rv.secs as s (s.k)}
						<PreviewBox box={s} onop={() => addOp(s.k)}>
							<PreviewSec kind={s.kind} head={s.head} items={s.items} ing={s.ing} noteTitle={rv.noteTitle} />
						</PreviewBox>
					{/each}
				</PreviewCard>
			</div>
			<div class="hidden lg:sticky lg:top-7 lg:block">
				<ReviewPanel
					bind:this={panel}
					{id}
					approveLabel="승인"
					rejectNote="의견 {products.opsOf(id).valid}개가 크리에이터에게 전달돼요"
					onreject={() => {
						const r = products.reject(id);
						if (r.ok) done(r, '/products?tab=review');
						return r;
					}}
					onapprove={() => open('approve')}
				/>
			</div>
		</div>
	</div>

	{#if modal === 'approve'}
		<Modal
			title="승인"
			desc="{rv.name} · {rv.cr.name}"
			ok="승인"
			sure="정말 승인하기"
			sureInfo="정말 승인할까요? 샵에 바로 공개돼요"
			sureKind="primary"
			info="승인하면 제조금액 원장이 함께 만들어져요 · 다음 정산부터 정산금에서 상계해요"
			onclose={() => (modal = null)}
			onok={() => done(products.approve(id, stockIn, amountIn), '/products?tab=review')}
		>
			<Field label="처음 재고" hint={approveHints.stock} hintRed={approveHints.stockRed}>
				<input bind:value={stockIn} inputmode="numeric" placeholder="예: 300" class={INPUT} />
			</Field>
			<Field label="제조금액" hint={approveHints.amount}>
				<input bind:value={amountIn} inputmode="numeric" placeholder="예: 400,000" class={INPUT} />
			</Field>
		</Modal>
	{/if}
{:else if v}
	<!-- ───────── 상품 관리 ───────── -->
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-3 lg:min-h-[52px] lg:flex-nowrap lg:gap-x-3.5">
			<a href={backHref} aria-label="상품 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
			<span class="hidden lg:block"><ProductThumb tile={v.tile} icon={v.icon} size={48} radius={14} art={26} /></span>
			<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{v.name}</h1>
			<div class="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0 lg:gap-2">
				{#each v.headChips as c (c.label)}<Chip label={c.label} tone={c.tone} md />{/each}
				<span class="text-[13px] text-white/50 tabular-nums lg:ml-1 lg:text-[14px]">{v.sub}</span>
			</div>
		</div>

		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<section class="rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:p-6">
					<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">상품 정보</h2>
					{#each v.info as r (r.k)}
						<div class="flex min-h-9 items-center justify-between gap-4 text-[14.5px] lg:min-h-[38px] lg:text-[15px]">
							<span class="text-white/60">{r.k}</span>
							<span class="text-right font-semibold tabular-nums {r.red ? 'text-danger-fg' : ''}">{r.v}</span>
						</div>
					{/each}
				</section>

				{#if v.revNote}
					<div class="flex items-center gap-3 rounded-[14px] border border-accent/26 bg-accent/8 px-4 py-[13px] text-[13.5px] leading-[1.5] font-semibold text-[#ff9a66]">
						<span class="min-w-0 flex-1">{v.revNote}</span>
						<a href="/products/{v.id}/revision" class="flex h-9 shrink-0 items-center rounded-xl border border-white/10 bg-white/6 px-3 text-[13px] font-bold text-fg hover:brightness-110">수정 심사 열기</a>
					</div>
				{/if}

				{#if v.showLedger}
					{#if v.ledger}
						<section class="rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:p-6">
							<div class="mb-3.5 flex flex-wrap items-center gap-2">
								<h2 class="text-[17px] font-extrabold tracking-[-0.01em]">제조금액 원장</h2>
								{#each v.ledger.chips as c (c.label)}<Chip label={c.label} tone={c.tone} md />{/each}
								<span class="flex-1"></span>
								<a href={v.ledger.href} class="flex h-9 items-center rounded-xl border border-white/10 bg-white/6 px-3 text-[13px] font-bold hover:brightness-110">원장 열기</a>
							</div>
							{#each v.ledger.rows as [k, val] (k)}
								<div class="flex min-h-9 items-center justify-between gap-4 text-[14.5px] lg:min-h-[38px] lg:text-[15px]"><span class="text-white/60">{k}</span><span class="font-semibold tabular-nums">{val}</span></div>
							{/each}
							<div class="mt-3 flex items-center gap-2.5">
								<span class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/9"><span class="block h-full rounded-full bg-accent" style:width="{v.ledger.pct}%"></span></span>
								<span class="shrink-0 text-[12.5px] font-semibold text-white/60 tabular-nums">{v.ledger.barText}</span>
							</div>
						</section>
					{:else}
						<div class="flex items-center gap-3 rounded-[14px] border border-danger/28 bg-danger/8 px-4 py-[13px] text-[13.5px] leading-[1.5] font-semibold text-danger-fg">
							<span class="min-w-0 flex-1">{v.noLedgerNote}</span>
							<button type="button" onclick={() => open('ledger')} class="flex h-9 shrink-0 items-center rounded-xl bg-accent px-3 text-[13px] font-bold text-bg hover:brightness-110">제조금액 입력</button>
						</div>
					{/if}
				{/if}

				{#if v.sent.length}
					<section class="rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:p-6">
						<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">보낸 의견 {v.sent.length}개</h2>
						<ul class="flex flex-col gap-2.5">
							{#each v.sent as s, n (n)}
								<li class="rounded-xl bg-white/4 px-3.5 py-3"><p class="mb-1 text-[12.5px] font-bold text-[#ff9a66]">{s.h}</p><p class="text-[14px] leading-[1.55] text-white/85">{s.t}</p></li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if v.log.length}
					<section class="rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:p-6">
						<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">처리 이력</h2>
						<Timeline items={v.log} oldFirst who={false} />
					</section>
				{/if}
			</div>

			<!-- 오른쪽 고정 패널 -->
			<aside class="order-first flex flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:sticky lg:top-7 lg:order-none lg:p-6">
				<div>
					<h2 class="mb-3.5 text-[17px] font-extrabold tracking-[-0.01em]">상태</h2>
					{#each [['크리에이터', `${v.creator.name} ${v.creator.handle}`], ['채널', v.creator.channel]] as [k, val] (k)}
						<div class="flex min-h-9 items-center justify-between gap-4 text-[14.5px] lg:min-h-[38px] lg:text-[15px]"><span class="text-white/60">{k}</span><span class="font-semibold">{val}</span></div>
					{/each}
				</div>
				{#if v.sideNote}<p class="rounded-[14px] border border-white/8 bg-white/4 px-4 py-[13px] text-[13.5px] leading-[1.5] font-semibold text-white/60">{v.sideNote}</p>{/if}
				{#if v.can.stock || v.can.end}
					<div class="flex flex-col gap-2">
						<div class="flex gap-2">
							{#if armed === 'pause'}
								<PanelBtn onclick={() => (armed = null)}>취소</PanelBtn>
								<PanelBtn tone="primary" onclick={pause}>정말 일시중지하기</PanelBtn>
							{:else}
								{#if v.can.stock}<PanelBtn onclick={() => open('stock')}>재고 수정</PanelBtn>{/if}
								{#if v.can.pause}<PanelBtn onclick={() => (armed = 'pause')}>일시중지</PanelBtn>{/if}
								{#if v.can.resume}<PanelBtn tone="primary" onclick={() => app.showToast(products.resume(id))}>다시 판매</PanelBtn>{/if}
							{/if}
						</div>
						{#if armed === 'pause'}<p class="text-[12.5px] leading-[1.45] font-semibold text-[#ff9a66]">{v.pauseNote}</p>{/if}
						{#if v.can.end}
							<div class="flex gap-2">
								{#if armed === 'end'}
									<PanelBtn onclick={() => (armed = null)}>취소</PanelBtn>
									<PanelBtn tone="solidRed" onclick={end}>정말 판매 종료하기</PanelBtn>
								{:else}
									<PanelBtn tone="danger" onclick={() => (armed = 'end')}>판매 종료</PanelBtn>
								{/if}
							</div>
							{#if armed === 'end'}<p class="text-[12.5px] leading-[1.45] font-semibold text-danger-fg">{v.endNote}</p>{/if}
						{/if}
					</div>
				{/if}
			</aside>
		</div>
	</div>

	{#if modal === 'stock'}
		<Modal title="재고 수정" desc="{v.name} · 지금 {v.stock ?? 0}개" ok="저장" onclose={() => (modal = null)} onok={() => done(products.setStock(id, stockIn))}>
			<Field label="재고" hint={stockHint.text} hintRed={stockHint.red}>
				<input bind:value={stockIn} inputmode="numeric" class={INPUT} />
			</Field>
		</Modal>
	{:else if modal === 'ledger'}
		<Modal
			title="제조금액 입력"
			desc="{v.name} · {v.creator.name} · 1차"
			ok="원장 만들기"
			info="다음 정산부터 정산금에서 상계가 시작돼요"
			onclose={() => (modal = null)}
			onok={() => done(products.addLedger(id, amountIn, memoIn))}
		>
			<Field label="제조금액" hint={products.ledgerHint(amountIn)}>
				<input bind:value={amountIn} inputmode="numeric" placeholder="예: 400,000" class={INPUT} />
			</Field>
			<Field label="메모 (선택)">
				<input bind:value={memoIn} maxlength="40" placeholder="예: 재생산 2,000포" class={INPUT} />
			</Field>
		</Modal>
	{/if}
{:else}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">상품을 찾을 수 없어요</p>
		<a href="/products" class="mt-3 inline-block text-[14px] font-bold text-accent">상품 목록으로</a>
	</div>
{/if}
