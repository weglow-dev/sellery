<script lang="ts">
	/** 교환 · 환불 요청(0078) — 배송준비중 이후 줄. RefundPage 가 [바로 환불 | 교환 · 환불 요청] 중 요청 쪽으로 그린다(머리는 RefundPage).
	 *  PC: 왼쪽 제품 체크 카드(수량 · 상세 · 사진) · 요청 종류(환불/교환) · 사유 칩 · 처리 기준 / 오른쪽 요약 · [요청 보내기] → 인라인 확인.
	 *  모바일: 같은 순서로 쌓고, 버튼은 요약 카드 안(요청은 즉시 결제 취소가 아니라 하단 고정 바를 두지 않는다).
	 *  규칙은 claim-rules(순수): 단순 변심은 환불만 · 파손 · 오배송은 사진 필수 · 처리 기준 문구. 서버(myr_app_claim_open)가 같은 규칙으로 다시 막는다.
	 *  사진은 환불 신청과 같은 API(/api/refunds/photos · 버킷 myr-refunds · 줄당 3장)로 올리고 경로만 보낸다. 보낸 뒤 주문 상세로.
 *  예상 환불 금액은 서버(/api/refunds/quote · 실제 환불과 같은 refundQuote — 마지막 줄이면 배송비 포함 · 단순 변심은 왕복 배송비 차감)가 정한다. */
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { won } from '$lib/data';
	import { RefundQuoteState } from '$lib/refund-quote.svelte';
	import { shop } from '$lib/state.svelte';
	import type { OrderItem, OrderView } from '@sellery/myr-core/order-view';
	import {
		CLAIM_REASONS,
		changeMindNote,
		claimMessage,
		claimPolicy,
		KIND_LABEL,
		kindAllowed,
		photoRequired,
		type ClaimKind,
		type ClaimReason
	} from '@sellery/myr-core/claim-rules';
	import { REFUND_NOTE_MAX, REFUND_PHOTO_ACCEPT, REFUND_PHOTO_MAX, REFUND_PHOTO_MAX_BYTES, REFUND_PHOTO_TYPES, refundLineAmount, remainingQty } from '@sellery/myr-core/refund-rules';
	import Tile from '$lib/components/Tile.svelte';

	let { order, lines, returnFee, backHref }: { order: OrderView; lines: OrderItem[]; returnFee: number | null; backHref: string } = $props();

	let qtyById = $state<Record<string, number>>({});
	let noteById = $state<Record<string, string>>({});
	type Photo = { path: string; url: string };
	let photosById = $state<Record<string, Photo[]>>({});
	let uploading = $state<Record<string, number>>({});
	let kind = $state<ClaimKind>('refund');
	let reason = $state<ClaimReason | ''>('');
	let confirming = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const chosen = $derived(lines.filter((l) => (qtyById[l.id] ?? 0) > 0));
	const count = $derived(chosen.reduce((n, l) => n + (qtyById[l.id] ?? 0), 0));
	const needPhoto = $derived(photoRequired(reason));
	const missingPhoto = $derived(needPhoto && chosen.some((l) => !(photosById[l.id]?.length)));
	const busy = $derived(Object.values(uploading).some((n) => n > 0));
	// 예상 환불 — 서버가 실제 환불과 같은 계산으로 정한다(고른 줄 · 수량 · 사유가 바뀔 때만 묻는다) · 최종 금액은 크리에이터 승인 · 회수 뒤 정해진다
	const quote = new RefundQuoteState();
	onDestroy(() => quote.dispose());
	const picksKey = $derived(JSON.stringify(chosen.map((l) => ({ itemId: l.id, qty: qtyById[l.id] ?? 0 }))));
	$effect(() => {
		const items = JSON.parse(picksKey) as { itemId: string; qty: number }[];
		const why = reason;
		const off = kind !== 'refund';
		untrack(() => quote.ask(off ? null : { orderCode: order.code, mode: 'claim', reason: why, items }));
	});
	const estimate = $derived(kind === 'refund' ? quote.quote : null);
	// 단순 변심 기한(0093 · 수령 후 7일) — 서버가 줄마다 준 changeMindOk 그대로. 지난 줄은 단순 변심으로 고를 수 없다(서버가 다시 막는다)
	const changeMind = $derived(reason === '단순 변심');
	const allExpired = $derived(lines.length > 0 && lines.every((l) => !l.changeMindOk));
	const expiredChosen = $derived(changeMind && chosen.some((l) => !l.changeMindOk));
	const ready = $derived(chosen.length > 0 && reason !== '' && kindAllowed(kind, reason) && !missingPhoto && !busy && !expiredChosen);
	const ctaLabel = $derived(
		chosen.length === 0 ? '제품을 선택하세요' : reason === '' ? '사유를 선택하세요' : expiredChosen ? '단순 변심 기한이 지난 상품이 있어요' : missingPhoto ? '사진을 올려주세요' : busy ? '사진을 올리는 중…' : `${KIND_LABEL[kind]} 요청 보내기`
	);

	function toggle(it: OrderItem, on: boolean) {
		qtyById = { ...qtyById, [it.id]: on ? remainingQty(it) : 0 };
		confirming = false;
	}
	function setQty(it: OrderItem, v: number) {
		qtyById = { ...qtyById, [it.id]: Math.max(1, Math.min(remainingQty(it), v)) };
		confirming = false;
	}
	function pickReason(r: ClaimReason) {
		reason = r;
		// 단순 변심을 고르면 기한이 지난 줄은 선택에서 뺀다(그 줄은 파손 · 오배송으로만)
		if (r === '단순 변심') qtyById = Object.fromEntries(Object.entries(qtyById).map(([id, q]) => [id, lines.find((l) => l.id === id)?.changeMindOk === false ? 0 : q]));
		if (!kindAllowed(kind, r)) kind = 'refund';
		confirming = false;
	}
	function pickKind(k: ClaimKind) {
		if (reason && !kindAllowed(k, reason)) return;
		kind = k;
		confirming = false;
	}
	async function addPhotos(itemId: string, files: FileList | null) {
		if (!files?.length) return;
		const room = REFUND_PHOTO_MAX - (photosById[itemId]?.length ?? 0) - (uploading[itemId] ?? 0);
		const picked = [...files].slice(0, Math.max(0, room));
		if (files.length > picked.length) shop.showToast(`사진은 제품당 ${REFUND_PHOTO_MAX}장까지 올릴 수 있어요`);
		for (const f of picked) {
			if (!REFUND_PHOTO_TYPES[f.type] || f.size > REFUND_PHOTO_MAX_BYTES) {
				shop.showToast('사진은 4MB 이하 jpg·png·webp 만 올릴 수 있어요');
				continue;
			}
			uploading = { ...uploading, [itemId]: (uploading[itemId] ?? 0) + 1 };
			try {
				const fd = new FormData();
				fd.set('orderCode', order.code);
				fd.set('itemId', itemId);
				fd.set('file', f);
				const res = await fetch('/api/refunds/photos', { method: 'POST', body: fd });
				const r = (await res.json().catch(() => null)) as { ok: boolean; path?: string; message?: string } | null;
				if (!res.ok || !r?.ok || !r.path) shop.showToast(r?.message ?? '사진을 올리지 못했어요');
				else photosById = { ...photosById, [itemId]: [...(photosById[itemId] ?? []), { path: r.path, url: URL.createObjectURL(f) }] };
			} catch {
				shop.showToast('사진을 올리지 못했어요');
			}
			uploading = { ...uploading, [itemId]: Math.max(0, (uploading[itemId] ?? 1) - 1) };
		}
	}
	async function removePhoto(itemId: string, photo: Photo) {
		photosById = { ...photosById, [itemId]: (photosById[itemId] ?? []).filter((p) => p.path !== photo.path) };
		URL.revokeObjectURL(photo.url);
		try {
			await fetch('/api/refunds/photos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderCode: order.code, path: photo.path }) });
		} catch {
			/* 화면에서는 이미 뺐다 — 남은 파일은 비공개 버킷의 고아(크론이 정리) */
		}
	}
	async function submit() {
		if (submitting || !ready) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/claims', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderCode: order.code,
					kind,
					reason,
					items: chosen.map((l) => {
						const note = (noteById[l.id] ?? '').trim();
						const photos = (photosById[l.id] ?? []).map((p) => p.path);
						return { itemId: l.id, qty: qtyById[l.id], ...(note ? { note } : {}), ...(photos.length ? { photos } : {}) };
					})
				})
			});
			const r = (await res.json().catch(() => null)) as { ok: boolean; code?: string; message?: string; items?: { reason: string }[] } | null;
			if (!res.ok || !r?.ok) {
				error = r?.message ?? claimMessage(r?.code ?? 'DB_ERROR', r?.items);
				confirming = false;
				submitting = false;
				return;
			}
			shop.showToast(`${KIND_LABEL[kind]} 요청을 보냈어요 — 크리에이터가 확인한 뒤 메일로 알려드려요`);
			await goto(backHref, { invalidateAll: true });
			return;
		} catch {
			error = claimMessage('DB_ERROR');
			confirming = false;
		}
		submitting = false;
	}

	const cta = 'flex h-14 w-full items-center justify-center rounded-[16px] text-[15px] font-extrabold transition-colors disabled:cursor-not-allowed';
	const ctaOn = 'bg-accent text-bg hover:brightness-105';
	const ctaOff = 'bg-white/8 text-white/40';
	const chip = 'h-11 rounded-[12px] border px-4 text-[14px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35';
	const checkCls =
		'h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-white/25 bg-transparent transition-colors checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%230a0b0e%27%20stroke-width=%273%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M5%2012.5l4.5%204.5L19%207.5%27/%3E%3C/svg%3E")] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat disabled:cursor-not-allowed disabled:opacity-30';
	const shipText: Record<string, string> = { PREPARING: '배송 준비중', SHIPPING: '배송 중', DELIVERED: '배송 완료' };
</script>

<div class="flex flex-col gap-3 px-5 pb-6 lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-0 lg:pb-0">
	<!-- 왼쪽: 제품 · 종류 · 사유 · 기준 -->
	<div class="flex flex-col gap-3">
		{#each lines as it (it.id)}
			{@const max = remainingQty(it)}
			{@const q = qtyById[it.id] ?? 0}
			{@const on = q > 0}
			{@const lineAmt = refundLineAmount(it, q, quote.quote)}
			{@const photos = photosById[it.id] ?? []}
			{@const up = uploading[it.id] ?? 0}
			<div class="rounded-[18px] border p-3 transition-colors lg:rounded-[20px] lg:p-4 {on ? 'border-accent bg-accent/5' : 'border-white/8 bg-white/3'}">
				<label class="flex min-w-0 cursor-pointer items-center gap-3 lg:gap-4">
					<input type="checkbox" class={checkCls} checked={on} disabled={submitting || (changeMind && !it.changeMindOk)} onchange={(e) => toggle(it, e.currentTarget.checked)} aria-label="{it.name} 선택" />
					<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt="" icon={24} class="h-14 w-14 shrink-0 rounded-[14px] lg:h-[60px] lg:w-[60px] lg:rounded-2xl" />
					<span class="min-w-0 flex-1">
						{#if it.creator}<span class="block text-[12px] font-bold text-accent">{it.creator}</span>{/if}
						<span class="block truncate text-[14.5px] font-bold">{it.name}{it.option ? ` · ${it.option}` : ''}</span>
						<span class="mt-0.5 block text-[12.5px] text-fg-faint">{on ? q : max}개{lineAmt === null ? '' : ` · ${won(lineAmt)}`}{shipText[it.shipStatus] ? ` · ${shipText[it.shipStatus]}` : ''}</span>
						{#if changeMindNote(it)}<span class="mt-1 block text-[12px] font-semibold text-[#ff8a8a]">{changeMindNote(it)}</span>{/if}
					</span>
				</label>
				{#if on}
					{#if max > 1}
						<div class="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
							<span class="text-[12.5px] text-fg-faint">요청 수량</span>
							<div class="flex items-center gap-1 rounded-[10px] border border-white/12" role="group" aria-label="{it.name} 요청 수량">
								<button type="button" aria-label="수량 줄이기" onclick={() => setQty(it, q - 1)} disabled={submitting || q <= 1} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">−</button>
								<span class="w-6 text-center text-[13px] font-bold tabular-nums">{q}</span>
								<button type="button" aria-label="수량 늘리기" onclick={() => setQty(it, q + 1)} disabled={submitting || q >= max} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">+</button>
							</div>
						</div>
					{/if}
					<textarea
						value={noteById[it.id] ?? ''}
						oninput={(e) => (noteById = { ...noteById, [it.id]: e.currentTarget.value })}
						rows="3"
						maxlength={REFUND_NOTE_MAX}
						disabled={submitting}
						placeholder="{it.creator || '크리에이터'}에게 전달할 상황 (선택) — 예: 상자가 눌려 2포가 터져 있었어요"
						aria-label="{it.name} 상세 내용"
						class="mt-3 w-full resize-none rounded-[12px] border-[1.5px] border-white/10 bg-white/4 px-4 py-3 text-[13.5px] leading-[1.55] text-fg outline-none placeholder:text-fg-faint focus:border-accent disabled:opacity-50"
					></textarea>
					<div class="mt-2.5 flex items-center gap-2.5">
						{#each photos as ph (ph.path)}
							<div class="relative h-14 w-14 shrink-0">
								<img src={ph.url} alt="" class="h-14 w-14 rounded-[12px] object-cover" />
								<button type="button" onclick={() => removePhoto(it.id, ph)} disabled={submitting} aria-label="사진 삭제" class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg text-fg ring-1 ring-white/25"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
							</div>
						{/each}
						{#if photos.length + up < REFUND_PHOTO_MAX}
							<label class="flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-dashed text-[11px] transition-colors hover:border-white/40 hover:text-fg {needPhoto && !photos.length ? 'border-accent/60 text-accent' : 'border-white/20 text-fg-faint'} {submitting || up ? 'pointer-events-none opacity-50' : ''}">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>
								{up ? '올리는 중' : '사진'}
								<input type="file" accept={REFUND_PHOTO_ACCEPT} multiple class="sr-only" disabled={submitting || !!up} onchange={(e) => { addPhotos(it.id, e.currentTarget.files); e.currentTarget.value = ''; }} />
							</label>
						{/if}
						<span class="text-[12px] {needPhoto && !photos.length ? 'text-accent' : 'text-fg-faint'}">{photos.length}/{REFUND_PHOTO_MAX}{needPhoto ? ' · 사진 필수' : ''}</span>
					</div>
				{/if}
			</div>
		{/each}

		<p class="mt-2 text-[14px] font-extrabold lg:mt-3 lg:text-[15px]">사유</p>
		<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="사유">
			{#each CLAIM_REASONS as r (r)}
				<button type="button" role="radio" aria-checked={reason === r} disabled={submitting || (r === '단순 변심' && allExpired)} onclick={() => pickReason(r)} class="{chip} {reason === r ? 'border-accent bg-accent/10 text-accent' : 'border-white/12 text-fg hover:border-white/30'}">{r}</button>
			{/each}
		</div>

		<p class="mt-2 text-[14px] font-extrabold lg:mt-3 lg:text-[15px]">요청 종류</p>
		<div class="grid max-w-[360px] grid-cols-2 gap-2" role="radiogroup" aria-label="요청 종류">
			{#each ['refund', 'exchange'] as const as k (k)}
				{@const allowed = !reason || kindAllowed(k, reason)}
				<button type="button" role="radio" aria-checked={kind === k} disabled={submitting || !allowed} onclick={() => pickKind(k)} class="{chip} {kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-white/12 text-fg hover:border-white/30'}">{KIND_LABEL[k]}</button>
			{/each}
		</div>
		{#if reason === '단순 변심'}<p class="text-[12.5px] text-fg-faint">단순 변심은 환불로만 받아요 — 왕복 배송비를 빼고 돌려드려요</p>{/if}

		{#if reason}
			<ul class="mt-1 flex flex-col gap-2 rounded-[18px] border border-accent/25 bg-accent/6 px-4 py-4 text-[13px] leading-[1.55] text-white/80 lg:rounded-[22px] lg:px-5" aria-label="처리 기준">
				{#each claimPolicy(reason, returnFee) as pl (pl)}
					<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>{pl}</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- 오른쪽: 요약 · 보내기 -->
	<div class="flex flex-col gap-3 lg:sticky lg:top-[104px]">
		<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-6 lg:py-6">
			<h2 class="text-[15px] font-extrabold lg:text-[16px]">요청 요약</h2>
			<div class="mt-3.5 flex flex-col gap-2 text-[14px]">
				<div class="flex justify-between text-fg-soft"><span>선택 제품</span><span class="text-fg">{count}개</span></div>
				<div class="flex justify-between text-fg-soft"><span>종류</span><span class="text-fg">{KIND_LABEL[kind]}</span></div>
				<div class="flex justify-between text-fg-soft"><span>사유</span><span class={reason ? 'text-fg' : 'text-fg-faint'}>{reason || '—'}</span></div>
			</div>
			{#if estimate}
				<!-- 요청 결제 금액(고른 수량) − 왕복 배송비 = 예상 환불 금액(서버 refundQuote 값 그대로) -->
				<div class="mt-3.5 flex flex-col gap-2 border-t border-white/8 pt-3.5 text-[14px]">
					<div class="flex justify-between text-fg-soft"><span>요청 결제 금액</span><span class="text-fg tabular-nums">{won(estimate.paid)}</span></div>
					{#if estimate.deduction}<div class="flex justify-between text-fg-soft"><span>왕복 배송비 차감</span><span class="text-fg tabular-nums">−{won(estimate.deduction)}</span></div>{/if}
				</div>
			{/if}
			<div class="mt-3.5 flex items-baseline justify-between border-t border-white/8 pt-3.5">
				<span class="text-[14px] font-bold">{kind === 'refund' ? '예상 환불 금액' : '처리'}</span>
				{#if kind !== 'refund'}
					<span class="text-[15px] font-extrabold text-accent">새 제품 재발송</span>
				{:else}
					<span class="text-[22px] font-extrabold tracking-[-.02em] text-accent lg:text-[24px]">{estimate ? won(estimate.amount) : chosen.length && quote.loading ? '확인 중' : '₩0'}</span>
				{/if}
			</div>
			{#if kind === 'refund' && quote.failed}<p class="mt-1.5 text-right text-[12px] text-[#ff8a8a]">금액을 확인하지 못했어요 — 요청은 보낼 수 있어요</p>{/if}
			{#if error}<p role="alert" class="mt-3 rounded-[12px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3 py-2.5 text-[13px] text-white/85">{error}</p>{/if}
			<div class="mt-5">
				{#if !confirming}
					<button type="button" onclick={() => (confirming = true)} disabled={submitting || !ready} class="{cta} {ready ? ctaOn : ctaOff}">{ctaLabel}</button>
				{:else}
					<p class="text-[13.5px] leading-[1.55] text-white/85">{KIND_LABEL[kind]} 요청을 보낼까요? 크리에이터가 확인한 뒤 처리 결과를 메일과 주문 상세로 알려드려요.</p>
					<div class="mt-3 flex gap-2">
						<button type="button" onclick={() => (confirming = false)} disabled={submitting} class="{cta} flex-1 border border-white/14 text-fg">아니요</button>
						<button type="button" onclick={submit} disabled={submitting} class="{cta} flex-1 {ctaOn} disabled:opacity-60">{submitting ? '보내는 중…' : '네, 보낼게요'}</button>
					</div>
				{/if}
			</div>
		</section>
		<ul class="flex flex-col gap-2 rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 text-[13px] leading-[1.55] text-white/75 lg:rounded-[22px] lg:px-5">
			<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40"></span>출고 준비가 시작된 상품은 바로 취소되지 않아요 — 크리에이터가 확인한 뒤 처리해요</li>
			<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40"></span>회수가 필요하면 택배 기사가 방문해요 · 환불은 회수 확인 뒤 결제수단으로 돌아가요</li>
			<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40"></span>상세 내용과 사진은 판매 크리에이터가 직접 확인해요</li>
		</ul>
	</div>
</div>
