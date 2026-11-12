<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { claimPolicy, claimQtyText, claimRefundView, CLAIM_MESSAGE_MAX, canDecide, KIND_LABEL, RESOLUTION_NAMES, type Resolution } from '@sellery/myr-core/claim-rules';
	import { CS_STATUS_META, CS_TYPE_META, STEP_TEXT, approveLabel, claimOrderedAmount, claimShipping, consoleTimeline, decideConfirm, dueText, isUrgentPending, replyChips, resolutionOptions } from '$lib/claims';
	import { goBack } from '$lib/nav';
	import { relativeTime } from '$lib/product-row';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Badge from '$lib/components/Badge.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import CheckDot from '$lib/components/CheckDot.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OrderShipCard from '$lib/components/OrderShipCard.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import SectionTitle from '$lib/components/SectionTitle.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 교환·환불 요청 상세(7번 · 0078) — 제품 · 주문 · 배송(문의 상세와 같은 칸 · 0080) · 고객 요청(사유 · 상세 · 사진) · 처리 기준.
	 *  처리 대기면 처리 방법 선택 + 고객 메시지 → [반려] / [○○ 승인](POST /api/claims/[code] · 고객 메일). 처리된 요청은 처리 결과 + 처리 내역(지금 단계는 운영 · 서버가 진행).
	 *  선택지 · 차감 금액 · 단계는 서버(claim JSON)가 정한 값 그대로. 회수 · 재발송 · 환불 실행은 MYR 운영(콘솔 전까지 myr-ops.mjs) · 서버.
	 *  모바일: 한 줄로 쌓고 하단 버튼 줄 / PC(lg~): 왼쪽 정보 + 오른쪽 420px 고정(sticky) 처리 패널 (디자인 "MYR Influencer Admin PC"). */
	let { data } = $props();
	const c = $derived(data.claim);
	// 처리 결과의 환불 — 요청 결제 금액(요청 수량) − 왕복 배송비 = 환불 금액. 환불 뒤 = 기록된 금액 · 환불 전 = 서버 예상 금액(claimQuotes.current · 실제 환불과 같은 계산)
	const refundShown = $derived(claimRefundView(c) ?? data.quotes.current ?? null);
	// 제품 카드 — 그 줄 주문 수량 전체의 금액(주문 · 배송 "상품 금액"과 같은 함수)
	const orderedAmount = $derived(claimOrderedAmount(c));

	let resolution = $state<Resolution | null>(null);
	let reply = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	const ok = $derived(canDecide(resolution, reply) && !busy);
	const canReject = $derived(reply.trim().length > 0 && reply.trim().length <= CLAIM_MESSAGE_MAX && !busy);
	// 한 번 더 확인 — 승인 · 반려는 고객 메일이 바로 나가고 되돌릴 수 없다(공구 종료와 같은 방식). 처리 방법 · 메시지를 바꾸면 확인을 다시 받는다
	let confirming = $state<'approve' | 'reject' | null>(null);
	const confirmView = $derived(confirming ? decideConfirm(c, confirming, resolution) : null);
	const pickResolution = (r: Resolution) => ((resolution = r), (confirming = null));
	const setReply = (v: string) => ((reply = v), (confirming = null));

	async function send(decision: 'approve' | 'reject') {
		if (busy || (decision === 'approve' ? !ok : !canReject)) {
			if (decision === 'reject' && !reply.trim()) error = '반려 사유를 고객에게 보낼 메시지로 적어주세요';
			return;
		}
		if (confirming !== decision) {
			confirming = decision;
			error = null;
			return;
		}
		busy = true;
		error = null;
		try {
			const res = await fetch(`/api/claims/${c.code}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(decision === 'approve' ? { decision, resolution, message: reply } : { decision, message: reply })
			});
			const r = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
			if (!res.ok || !r?.ok) {
				error = r?.message ?? '처리하지 못했어요 — 잠시 후 다시 시도해주세요';
				confirming = null;
				busy = false;
				return;
			}
			if (app.claimWaiting) app.claimWaiting -= 1;
			app.showToast(
				decision === 'reject' ? `${c.code.toUpperCase()} 반려했어요 — 고객에게 메일을 보냈어요` : `${approveLabel(c, resolution)}했어요 — 고객에게 메일을 보냈어요`
			);
			resolution = null;
			reply = '';
			confirming = null;
			await invalidateAll();
		} catch {
			error = '처리하지 못했어요 — 잠시 후 다시 시도해주세요';
			confirming = null;
		}
		busy = false;
	}
</script>

{#snippet options()}
	<!-- 주문 수량 중 일부만 요청했으면 처리 전에도 먼저 보여 준다(처리 결과의 "환불 요청" 줄과 같은 문구) -->
	{#if claimQtyText(c)}
		<div class="mb-2.5 flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 text-[13px] lg:text-[14px]"><span class="text-white/60">{KIND_LABEL[c.kind]} 요청</span><span class="font-bold text-fg">{claimQtyText(c)}</span></div>
	{/if}
	<div class="flex flex-col gap-2" role="radiogroup" aria-label="처리 방법">
		{#each resolutionOptions(c, data.quotes) as r (r.id)}
			{@const on = resolution === r.id}
			<button
				type="button"
				role="radio"
				aria-checked={on}
				onclick={() => pickResolution(r.id)}
				class="flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-all {on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/3 lg:hover:border-white/25'}"
			>
				<span class="box-border flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 {on ? 'border-accent bg-accent' : 'border-white/30'}">
					{#if on}<span class="h-2 w-2 rounded-full bg-bg"></span>{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-[14px] font-bold">{r.title}</span>
					<span class="mt-0.5 block text-[12px] text-white/55">{r.desc}</span>
				</span>
			</button>
		{/each}
	</div>
{/snippet}

{#snippet replyBox()}
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each replyChips(resolution) as rc (rc.name)}
			<button type="button" onclick={() => setReply(rc.text)} class="rounded-full border border-white/12 px-3 py-2 text-[12px] font-semibold text-white/80 transition-colors lg:hover:border-accent lg:hover:text-accent">{rc.name}</button>
		{/each}
	</div>
	<textarea class={TEXTAREA} rows="4" value={reply} oninput={(e) => setReply(e.currentTarget.value)} maxlength={CLAIM_MESSAGE_MAX} aria-label="고객에게 보낼 메시지" placeholder="고객에게 전달될 안내 문구 (승인은 선택 · 반려는 필수 — 메일에 들어가요)"></textarea>
	{#if error}<p role="alert" class="mt-2 text-[13px] text-accent">{error}</p>{/if}
{/snippet}

{#snippet timeline()}
	<ol class="flex flex-col">
		{#each consoleTimeline(c) as tl (tl.title)}
			<li class="flex gap-3.5">
				<div class="flex shrink-0 flex-col items-center">
					<CheckDot on={tl.done} />
					{#if !tl.last}<span class="min-h-[18px] w-0.5 flex-1 bg-white/10"></span>{/if}
				</div>
				<div class="pb-3.5">
					<p class="mt-px text-[14px] font-bold {tl.done ? 'text-fg' : 'text-white/60'}">{tl.title}</p>
					{#if tl.when}<p class="mt-[3px] text-[12px] break-words whitespace-pre-line text-white/50">{tl.when}</p>{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if c.status === 'progress' && c.step && STEP_TEXT[c.step]}<p class="mt-1 rounded-xl bg-white/4 px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-white/70">{STEP_TEXT[c.step]}</p>{/if}
{/snippet}

{#snippet actions(cls: string)}
	<div class="flex w-full gap-2.5">
		{#if confirmView}
			<button type="button" onclick={() => (confirming = null)} disabled={busy} class="w-24 shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg transition-colors lg:hover:border-white/35 {cls}">취소</button>
			<button type="button" onclick={() => confirming && send(confirming)} disabled={busy} class="flex-1 rounded-2xl bg-accent font-extrabold text-bg transition-colors disabled:opacity-60 {cls}">{busy ? '처리 중…' : confirmView.button}</button>
		{:else}
			<button type="button" onclick={() => send('reject')} disabled={busy} class="w-24 shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg transition-colors lg:hover:border-white/35 {cls}">반려</button>
			<button type="button" onclick={() => send('approve')} disabled={!ok} class="flex-1 rounded-2xl font-extrabold transition-colors duration-250 {ok ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'} {cls}">{busy ? '처리 중…' : approveLabel(c, resolution)}</button>
		{/if}
	</div>
{/snippet}

{#key c.id}
	{@const tm = CS_TYPE_META[c.kind]}
	{@const sm = CS_STATUS_META[c.status]}
	{@const pendingNow = c.status === 'pending'}
	{@const received = c.order.item.deliveredAt ? `수령 ${relativeTime(c.order.item.deliveredAt)}` : c.order.item.shippedAt ? `발송 ${relativeTime(c.order.item.shippedAt)}` : '출고 준비 중'}
	<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
		<BackHeader title="{tm.label} 요청" fallback="/cs">
			{#snippet right()}<span class="text-[12px] text-white/45">{c.code.toUpperCase()}</span>{/snippet}
		</BackHeader>

		<!-- PC 제목 줄 -->
		<div class="hidden items-center gap-3 lg:flex">
			<PcBack onclick={() => goBack('/cs')} />
			<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">{tm.label} 요청</h1>
			<span class="ml-auto flex items-center gap-2.5">
				<span class="rounded-lg px-3 py-1.5 text-[13px] font-bold {sm.cls}">{sm.label}</span>
				<span class="text-[13px] text-white/45">{c.code.toUpperCase()} · {relativeTime(c.createdAt)}</span>
			</span>
		</div>

		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-8 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
			<div>
				<div class="flex items-center gap-2 lg:hidden">
					<Badge cls={tm.cls} lg>{tm.label}</Badge>
					<Badge cls={sm.cls} lg strong={false}>{sm.label}</Badge>
					{#if isUrgentPending(c)}<span class="ml-auto text-[12px] font-bold text-accent">{dueText(c)}</span>{/if}
				</div>

				<!-- 제품 카드 — 주문한 수량 · 금액 전체(요청 수량은 처리 방법 · 처리 결과의 "환불 요청 N개 (주문 M개 중)") -->
				<div class="mt-4 flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:mt-0 lg:gap-4 lg:p-[18px]">
					<Tile tile="slate" bg={c.product?.tile} iconId={c.product?.icon} thumbUrl={c.product?.thumbUrl} icon={36} iconCls="lg:h-11 lg:w-11" class="h-16 w-16 rounded-2xl lg:h-20 lg:w-20 lg:rounded-[18px]" />
					<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
						<span class="text-[15px] leading-[1.3] font-bold lg:text-[17px]">{c.order.item.name}{c.order.item.option ? ` · ${c.order.item.option}` : ''}</span>
						<span class="text-[12px] text-white/55 lg:text-[13px]">{c.order.item.qty}개 · 주문 {c.order.code.toUpperCase()}</span>
						<span class="mt-0.5 text-[15px] font-extrabold tabular-nums lg:hidden">{won(orderedAmount)}</span>
					</span>
					<span class="hidden text-[20px] font-extrabold whitespace-nowrap tabular-nums lg:block">{won(orderedAmount)}</span>
				</div>

				<!-- 주문 · 배송 — 문의 상세와 같은 칸(요청이 걸린 줄 · 0080) -->
				<SectionTitle>주문 · 배송</SectionTitle>
				<OrderShipCard title="주문 {c.order.code.toUpperCase()}" ship={claimShipping(c)} />

				<SectionTitle>고객 요청</SectionTitle>
				<div class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
					<div class="flex items-center gap-2.5 lg:gap-3">
						<span class="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white/8 text-[12px] font-extrabold lg:h-10 lg:w-10 lg:text-[14px]" aria-hidden="true">{c.buyerName[0] ?? '고'}</span>
						<span>
							<span class="block text-[14px] font-bold lg:text-[15px]">{c.buyerName}</span>
							<span class="block text-[12px] text-white/50 lg:text-[13px]">{c.buyerPhone ? `${c.buyerPhone} · ` : ''}{received}</span>
						</span>
						<span class="ml-auto hidden items-center gap-2 lg:flex">
							<span class="text-[12px] text-white/50">사유</span>
							<span class="rounded-lg bg-white/6 px-2.5 py-[5px] text-[13px] font-bold">{c.reason}</span>
						</span>
					</div>
					<div class="mt-3 flex items-center gap-2 lg:hidden">
						<span class="text-[12px] text-white/50">사유</span>
						<span class="rounded-lg bg-white/6 px-[9px] py-1 text-[12px] font-bold">{c.reason}</span>
					</div>
					{#if c.note}
						<p class="mt-3 text-[14px] leading-[1.65] text-pretty break-words whitespace-pre-line text-white/85 lg:mt-4 lg:text-[15px] lg:leading-[1.7]">"{c.note}"</p>
					{/if}
					{#if data.photoUrls.length}
						<div class="mt-3 flex gap-1.5 lg:mt-4 lg:gap-2">
							{#each data.photoUrls as ph, i (ph)}
								<a href={ph} target="_blank" rel="noopener" aria-label="고객 사진 {i + 1} 크게 보기" class="block h-16 w-16 overflow-hidden rounded-xl border border-white/10 lg:h-[88px] lg:w-[88px] lg:rounded-[14px]"><img src={ph} alt="" class="h-full w-full object-cover" /></a>
							{/each}
						</div>
					{:else if c.photos.length}
						<p class="mt-3 text-[12px] text-white/45">사진 {c.photos.length}장 — 불러오지 못했어요. 새로고침해 주세요</p>
					{/if}
				</div>

				<SectionTitle>처리 기준</SectionTitle>
				<ul class="flex flex-col gap-2 rounded-2xl border border-accent/20 bg-accent/7 px-4 py-3.5 text-[13px] leading-normal text-white/80 lg:gap-2.5 lg:rounded-[20px] lg:px-5 lg:py-[18px] lg:text-[14px]">
					{#each claimPolicy(c.reason, c.returnFee) as pl (pl)}
						<li class="flex items-start gap-2 lg:gap-2.5"><span class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent lg:mt-2" aria-hidden="true"></span><span>{pl}</span></li>
					{/each}
				</ul>

				<!-- 모바일: 처리 방법 · 메시지 또는 처리 내역 (PC 는 오른쪽 패널) -->
				<div class="lg:hidden">
					{#if pendingNow}
						<SectionTitle>처리 방법</SectionTitle>
						{@render options()}
						<SectionTitle>고객에게 보낼 메시지</SectionTitle>
						{@render replyBox()}
					{:else}
						<SectionTitle>처리 내역</SectionTitle>
						{@render timeline()}
					{/if}
				</div>
			</div>

			<!-- PC 오른쪽 고정 패널 -->
			<aside class="sticky top-8 hidden rounded-3xl border border-white/8 bg-panel p-6 lg:block">
				{#if pendingNow}
					<div class="flex items-center justify-between">
						<p class="text-[16px] font-extrabold">처리 방법</p>
						{#if isUrgentPending(c)}<span class="flex items-center gap-[5px] text-[12px] font-bold text-accent"><Icon id="clock" size={13} sw={2.2} />{dueText(c)}</span>{/if}
					</div>
					<div class="mt-3.5">{@render options()}</div>
					<p class="mt-[22px] mb-2.5 text-[14px] font-extrabold text-white/70">고객에게 보낼 메시지</p>
					{@render replyBox()}
					<div class="mt-4 flex gap-2.5">{@render actions('h-[54px] text-[15px]')}</div>
				{:else}
					<p class="text-[16px] font-extrabold">처리 결과</p>
					<dl class="mt-3.5 flex flex-col gap-2.5 text-[14px]">
						<div class="flex justify-between text-white/60"><dt>처리 방법</dt><dd class="font-semibold text-fg">{c.resolution ? RESOLUTION_NAMES[c.resolution] : '반려'}</dd></div>
						{#if c.needsRefund}
							{#if refundShown}
								{#if claimQtyText(c)}<div class="flex justify-between text-white/60"><dt>{KIND_LABEL[c.kind]} 요청</dt><dd class="font-semibold text-fg">{claimQtyText(c)}</dd></div>{/if}
								<div class="flex justify-between text-white/60"><dt>요청 결제 금액</dt><dd class="font-semibold text-fg tabular-nums">{won(refundShown.paid)}</dd></div>
								{#if refundShown.deduction}<div class="flex justify-between text-white/60"><dt>왕복 배송비 차감</dt><dd class="font-semibold text-fg tabular-nums">−{won(refundShown.deduction)}</dd></div>{/if}
								<div class="flex justify-between text-white/60"><dt class="font-bold text-fg">환불 금액</dt><dd class="font-extrabold text-fg tabular-nums">{won(refundShown.amount)}</dd></div>
							{:else}
								<div class="flex justify-between text-white/60"><dt>환불 금액</dt><dd class="font-semibold text-fg">확인 중</dd></div>
							{/if}
						{/if}
						<div class="mt-1 flex items-baseline justify-between border-t border-white/8 pt-3"><dt class="font-bold">상태</dt><dd class="rounded-lg px-2.5 py-[5px] text-[13px] font-bold {sm.cls}">{sm.label}</dd></div>
					</dl>
					<p class="mt-[22px] mb-3 text-[14px] font-extrabold text-white/70">처리 내역</p>
					{@render timeline()}
					<button type="button" onclick={() => goBack('/cs')} class="mt-2 h-[54px] w-full rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg transition-colors hover:border-white/35">목록으로</button>
				{/if}
			</aside>
		</div>

		{#if pendingNow}
			<BottomBar>{@render actions('h-14 text-[16px]')}</BottomBar>
		{/if}
	</div>
{/key}
