<script lang="ts">
	/** 환불 신청 페이지(대표 시안 2026-11-03) — /orders/[code]/refund · /orders/g/[code]/refund 가 같은 컴포넌트(backHref 만 다르다).
	 *  PC: 제목 + 주문번호 / 왼쪽 제품 체크 카드(수량 2개 이상이면 수량 · 접히는 "상세 내용 (선택)" = 크리에이터에게 전달 · 0067 줄 refund_reason) + 환불 사유 드롭다운(REFUND_REASONS 만)
	 *      / 오른쪽 환불 요약(선택 수 · 사유 · 예상 금액 · [환불 신청] → 인라인 확인) + 안내.
	 *  모바일: 뒤로 헤더(주문번호) · 같은 순서로 쌓고 하단 바 버튼(앱 셸 바닥 — fixed 아님). 입금 대기 주문은 "주문 취소"(토스 호출 없음 · 확인만).
	 *  사진(0068): 고르는 즉시 POST /api/refunds/photos 로 올리고(줄당 3장 · 4MB · jpeg/png/webp) 경로만 들고 있다가 신청 본문 items[].photos 로 보낸다 · × 는 DELETE. 미리보기는 브라우저 object URL.
	 *  금액은 화면 추정(estimateRefund) · 서버 precheck 가 다시 계산. 브라우저 confirm() 은 쓰지 않는다. 보낸 뒤 주문 상세로.
	 *  0078: 줄마다 길이 갈린다 — 결제완료(발주 전) 줄 = [바로 환불](이 화면) · 배송준비중 이후 줄 = [교환 · 환불 요청](ClaimForm · 크리에이터 승인).
	 *  두 가지가 다 있으면 머리 아래 전환 탭 · 하나뿐이면 그쪽만. 하단 고정 바는 바로 환불만(요청은 요약 카드 안 버튼). */
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import { displayCode, type OrderView } from '@sellery/myr-core/order-view';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import ClaimForm from '$lib/components/ClaimForm.svelte';
	import Tile from '$lib/components/Tile.svelte';
	import { claimableItems, isOpenClaim, type Claim } from '@sellery/myr-core/claim-rules';
	import { customerCanRefund, customerRefundableItems, estimateRefund, refundMessage, REFUND_NOTE_MAX, REFUND_PHOTO_ACCEPT, REFUND_PHOTO_MAX, REFUND_PHOTO_MAX_BYTES, REFUND_PHOTO_TYPES, REFUND_REASONS, remainingQty, type RefundLine } from '@sellery/myr-core/refund-rules';

	let { order, claims = [], returnFee = 6000, backHref }: { order: OrderView; claims?: Claim[]; returnFee?: number; backHref: string } = $props();
	const can = $derived(customerCanRefund(order));
	const deposit = $derived(can.ok && can.deposit);
	// 고객이 직접 환불할 수 있는 줄 = 아직 발주 전(결제완료) — 0077 · 배송준비중 이후 줄은 교환 · 환불 요청(0078)
	const lines = $derived(customerRefundableItems(order.items));
	const claimLines = $derived(claimableItems(order.items, claims));
	// 처음 보이는 쪽 — 바로 환불할 줄이 있으면 그쪽, 없으면 요청
	let mode = $state<'instant' | 'claim'>(untrack(() => (lines.length || deposit ? 'instant' : 'claim')));
	const both = $derived(!deposit && lines.length > 0 && (claimLines.length > 0 || claims.some(isOpenClaim)));

	// 줄이 하나면 미리 고르고, 여럿이면 고객이 고른다
	let qtyById = $state<Record<string, number>>(untrack(() => Object.fromEntries(lines.length === 1 ? lines.map((l) => [l.id, remainingQty(l)]) : [])));
	let noteById = $state<Record<string, string>>({});
	let noteOpen = $state<Record<string, boolean>>({});
	type Photo = { path: string; url: string };
	let photosById = $state<Record<string, Photo[]>>({});
	let uploading = $state<Record<string, number>>({});
	let reason = $state('');
	let reasonOpen = $state(false);
	let confirming = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const chosen = $derived<RefundLine[]>(
		Object.entries(qtyById)
			.filter(([, q]) => q > 0)
			.map(([item_id, qty]) => {
				const note = (noteById[item_id] ?? '').trim();
				const photos = (photosById[item_id] ?? []).map((p) => p.path);
				const line: RefundLine = { item_id, qty };
				if (note) line.note = note;
				if (photos.length) line.photos = photos;
				return line;
			})
	);
	const count = $derived(chosen.reduce((n, c) => n + c.qty, 0));
	const est = $derived(estimateRefund(order, chosen));
	const ready = $derived(deposit || (chosen.length > 0 && reason !== ''));
	const ctaLabel = $derived(deposit ? '주문 취소' : chosen.length === 0 ? '제품을 선택하세요' : reason === '' ? '사유를 선택하세요' : `${won(est.amount)} 환불 신청`);

	function toggle(id: string, max: number, on: boolean) {
		qtyById = { ...qtyById, [id]: on ? max : 0 };
		confirming = false;
	}
	function setQty(id: string, max: number, v: number) {
		qtyById = { ...qtyById, [id]: Math.max(1, Math.min(max, v)) };
		confirming = false;
	}
	function pickReason(r: string) {
		reason = r;
		reasonOpen = false;
		confirming = false;
	}
	function reasonKey(e: KeyboardEvent) {
		if (e.key === 'Escape') reasonOpen = false;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const i = REFUND_REASONS.indexOf(reason as (typeof REFUND_REASONS)[number]);
			const n = e.key === 'ArrowDown' ? Math.min(REFUND_REASONS.length - 1, i + 1) : Math.max(0, i - 1);
			reason = REFUND_REASONS[n];
			reasonOpen = true;
		}
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
			/* 화면에서는 이미 뺐다 — 남은 파일은 비공개 버킷의 고아(운영 정리) */
		}
	}
	async function submit() {
		if (submitting) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/payments/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderCode: order.code,
					items: deposit ? [] : chosen.map((c) => ({ itemId: c.item_id, qty: c.qty, ...(c.note ? { note: c.note } : {}) })),
					reason: deposit ? '고객 요청' : reason
				})
			});
			const r = (await res.json().catch(() => null)) as { ok: boolean; code?: string; message?: string; refunded?: number } | null;
			if (!res.ok || !r?.ok) {
				error = refundMessage(r?.code ?? 'TOSS_ERROR', r?.message);
				confirming = false;
				submitting = false;
				return;
			}
			shop.showToast(deposit ? '주문을 취소했어요' : r.refunded ? `${won(r.refunded)} 환불을 접수했어요` : '환불을 접수했어요');
			await goto(backHref, { invalidateAll: true });
			return;
		} catch {
			error = refundMessage('TOSS_ERROR');
			confirming = false;
		}
		submitting = false;
	}

	const cta = 'flex h-14 w-full items-center justify-center rounded-[16px] text-[15px] font-extrabold transition-colors disabled:cursor-not-allowed';
	const ctaOn = 'bg-accent text-bg hover:brightness-105';
	const ctaOff = 'bg-white/8 text-white/40';
	const checkCls =
		'h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-white/25 bg-transparent transition-colors checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%230a0b0e%27%20stroke-width=%273%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M5%2012.5l4.5%204.5L19%207.5%27/%3E%3C/svg%3E")] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat disabled:cursor-not-allowed disabled:opacity-30';
	const title = $derived(deposit ? '주문 취소' : '교환 · 환불 신청');
	const modes = [
		{ id: 'instant' as const, name: '바로 환불', hint: '발주 전 상품' },
		{ id: 'claim' as const, name: '교환 · 환불 요청', hint: '출고 준비 이후 상품' }
	];
</script>

<div class="flex h-full flex-col lg:mx-auto lg:block lg:h-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain lg:overflow-visible">
		<BackHeader {title}>
			{#snippet right()}<span class="font-mono text-[13px] text-fg-faint">{displayCode(order.code)}</span>{/snippet}
		</BackHeader>
		<div class="hidden items-center justify-between lg:flex">
			<h1 class="text-[32px] font-extrabold tracking-[-.03em]">{title}</h1>
			<span class="font-mono text-[13px] text-fg-faint">{displayCode(order.code)}</span>
		</div>

		{#if both}
			<div class="mx-5 mt-1 grid grid-cols-2 gap-1 rounded-[14px] bg-white/5 p-1 lg:mx-0 lg:mt-6 lg:max-w-[440px]" role="tablist" aria-label="신청 방법">
				{#each modes as m (m.id)}
					<button type="button" role="tab" aria-selected={mode === m.id} onclick={() => (mode = m.id)} class="flex flex-col items-center justify-center rounded-[10px] py-2 transition-all {mode === m.id ? 'bg-[#2a2c33] text-fg' : 'text-white/55'}">
						<span class="text-[14px] font-bold">{m.name}</span>
						<span class="text-[11.5px] {mode === m.id ? 'text-fg-faint' : 'text-white/40'}">{m.hint}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if !can.ok}
			<p class="mx-5 mt-2 rounded-[14px] border border-white/8 bg-white/3 px-4 py-3 text-[13px] text-white/70 lg:mx-0 lg:mt-6">{can.reason} <a href={backHref} class="font-bold text-accent">주문 상세</a></p>
		{:else if mode === 'claim'}
			<ClaimForm {order} {claims} lines={claimLines} {returnFee} {backHref} />
		{:else}
			<div class="flex flex-col gap-3 px-5 pb-6 lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-0 lg:pb-0">
				<!-- 왼쪽: 제품 · 사유 -->
				<div class="flex flex-col gap-3">
					{#if deposit}
						<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 text-[13.5px] leading-[1.6] text-white/80 lg:rounded-[20px] lg:px-5">
							아직 입금 전이라 결제 없이 바로 취소돼요. 예약된 재고도 풀립니다.
						</div>
						{#each order.items as it (it.id)}
							<div class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 lg:gap-4 lg:rounded-[20px] lg:p-4">
								<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt="" icon={24} class="h-14 w-14 rounded-[14px] lg:h-[60px] lg:w-[60px] lg:rounded-2xl" />
								<div class="min-w-0 flex-1">
									{#if it.creator}<p class="text-[12px] font-bold text-accent">{it.creator}</p>{/if}
									<p class="truncate text-[14.5px] font-bold">{it.name}{#if it.option} · {it.option}{/if}</p>
									<p class="mt-0.5 text-[12.5px] text-fg-faint">{it.qty}개 · {won(it.amount)}</p>
								</div>
							</div>
						{/each}
					{:else}
						{#each lines as it (it.id)}
							{@const max = remainingQty(it)}
							{@const q = qtyById[it.id] ?? 0}
							{@const on = q > 0}
							{@const noteId = `rf-note-${it.id}`}
							<div class="rounded-[18px] border p-3 transition-colors lg:rounded-[20px] lg:p-4 {on ? 'border-accent bg-accent/5' : 'border-white/8 bg-white/3'}">
								<label class="flex min-w-0 cursor-pointer items-center gap-3 lg:gap-4">
									<input type="checkbox" class={checkCls} checked={on} disabled={submitting} onchange={(e) => toggle(it.id, max, e.currentTarget.checked)} aria-label="{it.name} 선택" />
									<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt="" icon={24} class="h-14 w-14 shrink-0 rounded-[14px] lg:h-[60px] lg:w-[60px] lg:rounded-2xl" />
									<span class="min-w-0 flex-1">
										{#if it.creator}<span class="block text-[12px] font-bold text-accent">{it.creator}</span>{/if}
										<span class="block truncate text-[14.5px] font-bold">{it.name}{#if it.option} · {it.option}{/if}</span>
										<span class="mt-0.5 block text-[12.5px] text-fg-faint">{on ? q : max}개 · {won(it.unitPrice * (on ? q : max))}</span>
									</span>
								</label>
								{#if on}
									{#if max > 1}
										<div class="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
											<span class="text-[12.5px] text-fg-faint">환불 수량</span>
											<div class="flex items-center gap-1 rounded-[10px] border border-white/12" role="group" aria-label="{it.name} 환불 수량">
												<button type="button" aria-label="수량 줄이기" onclick={() => setQty(it.id, max, q - 1)} disabled={submitting || q <= 1} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">−</button>
												<span class="w-6 text-center text-[13px] font-bold tabular-nums">{q}</span>
												<button type="button" aria-label="수량 늘리기" onclick={() => setQty(it.id, max, q + 1)} disabled={submitting || q >= max} class="h-8 w-8 text-[16px] text-fg disabled:opacity-30">+</button>
											</div>
										</div>
									{/if}
									<!-- 상세 내용(선택) — 크리에이터에게 전달 · 접힘 -->
									<button type="button" onclick={() => (noteOpen = { ...noteOpen, [it.id]: !noteOpen[it.id] })} aria-expanded={!!noteOpen[it.id]} aria-controls={noteId} class="mt-3 flex h-11 w-full items-center justify-between rounded-[12px] border border-white/10 bg-white/4 px-4 text-left text-[13px] font-bold text-fg transition-colors hover:border-white/20">
										<span>상세 내용 · 사진 추가 (선택){#if (noteById[it.id] ?? '').trim() || photosById[it.id]?.length}<span class="ml-1.5 text-accent">·</span>{/if}</span>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-fg-faint transition-transform {noteOpen[it.id] ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
									</button>
									{#if noteOpen[it.id]}
										{@const photos = photosById[it.id] ?? []}
										{@const busy = uploading[it.id] ?? 0}
										<div id={noteId} class="mt-2">
											<textarea
												value={noteById[it.id] ?? ''}
												oninput={(e) => (noteById = { ...noteById, [it.id]: e.currentTarget.value })}
												rows="3"
												maxlength={REFUND_NOTE_MAX}
												disabled={submitting}
												placeholder="{it.creator || '크리에이터'}에게 전달할 상세 내용 (상태·상황)"
												aria-label="{it.name} 상세 내용"
												class="w-full resize-none rounded-[12px] border-[1.5px] border-white/10 bg-white/4 px-4 py-3 text-[13.5px] leading-[1.55] text-fg outline-none placeholder:text-fg-faint focus:border-accent disabled:opacity-50"
											></textarea>
											<div class="mt-2.5 flex items-center gap-2.5">
												{#each photos as ph (ph.path)}
													<div class="relative h-14 w-14 shrink-0">
														<img src={ph.url} alt="" class="h-14 w-14 rounded-[12px] object-cover" />
														<button type="button" onclick={() => removePhoto(it.id, ph)} disabled={submitting} aria-label="사진 삭제" class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg text-fg ring-1 ring-white/25"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
													</div>
												{/each}
												{#if photos.length + busy < REFUND_PHOTO_MAX}
													<label class="flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] border border-dashed border-white/20 text-[11px] text-fg-faint transition-colors hover:border-white/40 hover:text-fg {submitting || busy ? 'pointer-events-none opacity-50' : ''}">
														<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>
														{busy ? '올리는 중' : '사진'}
														<input type="file" accept={REFUND_PHOTO_ACCEPT} multiple class="sr-only" disabled={submitting || !!busy} onchange={(e) => { addPhotos(it.id, e.currentTarget.files); e.currentTarget.value = ''; }} />
													</label>
												{/if}
												<span class="text-[12px] text-fg-faint">{photos.length}/{REFUND_PHOTO_MAX}</span>
											</div>
											<p class="mt-2 text-[12px] text-fg-faint">이 제품의 CS는 {it.creator || '크리에이터'}이(가) 직접 확인해요</p>
										</div>
									{/if}
								{/if}
							</div>
						{/each}

						<p class="mt-2 text-[14px] font-extrabold lg:mt-3 lg:text-[15px]">환불 사유</p>
						<div class="relative lg:max-w-[480px]">
							<button
								type="button"
								onclick={() => (reasonOpen = !reasonOpen)}
								onkeydown={reasonKey}
								disabled={submitting}
								aria-haspopup="listbox"
								aria-expanded={reasonOpen}
								aria-label="환불 사유"
								class="flex h-[52px] w-full items-center justify-between rounded-[14px] border bg-white/4 px-4 text-left text-[14px] transition-colors focus:outline-none disabled:opacity-50 {reasonOpen ? 'border-accent' : 'border-white/10'} {reason === '' ? 'text-fg-faint' : 'text-fg'}"
							>
								<span class="truncate">{reason === '' ? '사유를 선택하세요' : reason}</span>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-fg-faint transition-transform {reasonOpen ? 'rotate-180' : ''}" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
							</button>
							{#if reasonOpen}
								<button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="사유 목록 닫기" onclick={() => (reasonOpen = false)}></button>
								<ul role="listbox" aria-label="환불 사유" class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[14px] border border-white/10 bg-[#15161a] shadow-[0_12px_32px_rgba(0,0,0,.45)]">
									{#each REFUND_REASONS as r (r)}
										<li role="option" aria-selected={reason === r}>
											<button type="button" onclick={() => pickReason(r)} class="flex h-12 w-full items-center justify-between border-b border-white/6 px-4 text-left text-[14px] transition-colors last:border-b-0 hover:bg-white/5 {reason === r ? 'font-bold text-accent' : 'text-fg'}">
												<span>{r}</span>
												{#if reason === r}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</div>

				<!-- 오른쪽: 요약 · 안내 -->
				<div class="flex flex-col gap-3 lg:sticky lg:top-[104px]">
					<section class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-4 lg:rounded-[22px] lg:px-6 lg:py-6">
						<h2 class="text-[15px] font-extrabold lg:text-[16px]">{deposit ? '취소 요약' : '환불 요약'}</h2>
						{#if deposit}
							<div class="mt-3.5 flex flex-col gap-2 text-[14px]">
								<div class="flex justify-between text-fg-soft"><span>주문 금액</span><span class="text-fg">{won(order.amount)}</span></div>
								<div class="flex justify-between text-fg-soft"><span>결제</span><span class="text-fg">입금 전</span></div>
							</div>
						{:else}
							<div class="mt-3.5 flex flex-col gap-2 text-[14px]">
								<div class="flex justify-between text-fg-soft"><span>선택 제품</span><span class="text-fg">{count}개</span></div>
								<div class="flex justify-between text-fg-soft"><span>사유</span><span class={reason ? 'text-fg' : 'text-fg-faint'}>{reason || '—'}</span></div>
							</div>
							<div class="mt-3.5 flex items-baseline justify-between border-t border-white/8 pt-3.5">
								<span class="text-[14px] font-bold">예상 환불 금액{#if est.full && order.shippingFee} <span class="text-[12px] font-normal text-fg-faint">(배송비 포함)</span>{/if}</span>
								<span class="text-[22px] font-extrabold tracking-[-.02em] text-accent lg:text-[24px]">{won(est.amount)}</span>
							</div>
						{/if}
						{#if error}<p role="alert" class="mt-3 rounded-[12px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3 py-2.5 text-[13px] text-white/85">{error}</p>{/if}
						<!-- 버튼은 PC 만 여기 · 모바일은 하단 바 -->
						<div class="mt-5 hidden lg:block">
							{#if !confirming}
								<button type="button" onclick={() => (confirming = true)} disabled={submitting || !ready} class="{cta} {ready ? ctaOn : ctaOff}">{ctaLabel}</button>
							{:else}
								<p class="text-[13.5px] leading-[1.55] text-white/85">{deposit ? '이 주문을 취소할까요? 되돌릴 수 없어요.' : `${won(est.amount)}을 환불할까요? 되돌릴 수 없고, 카드사에 따라 영업일 3일 안에 반영돼요.`}</p>
								<div class="mt-3 flex gap-2">
									<button type="button" onclick={() => (confirming = false)} disabled={submitting} class="{cta} flex-1 border border-white/14 text-fg">아니요</button>
									<button type="button" onclick={submit} disabled={submitting} class="{cta} flex-1 {ctaOn} disabled:opacity-60">{submitting ? '처리 중…' : deposit ? '네, 취소할게요' : '네, 환불할게요'}</button>
								</div>
							{/if}
						</div>
					</section>

					<ul class="flex flex-col gap-2 rounded-[18px] border border-accent/25 bg-accent/6 px-4 py-4 text-[13px] leading-[1.55] text-white/80 lg:rounded-[22px] lg:px-5">
						{#if deposit}
							<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>입금 전 취소는 결제 없이 바로 끝나요</li>
							<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>같은 상품을 다시 주문하면 새 가상계좌가 발급돼요</li>
						{:else}
							<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>발송 전 주문은 바로 환불돼요 · 카드는 카드사에 따라 영업일 3일 안에 반영돼요</li>
							<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>상세 내용과 사진은 판매 크리에이터가 직접 확인해요</li>
							<li class="flex gap-2.5"><span aria-hidden="true" class="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>교환이나 출고 준비가 시작된 상품은 [교환 · 환불 요청]으로 신청해주세요</li>
						{/if}
					</ul>
				</div>
			</div>
		{/if}
	</div>

	<!-- 모바일 하단 바 — 바로 환불만(요청은 요약 카드 안 버튼) -->
	{#if can.ok && mode === 'instant'}
		<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden">
			{#if !confirming}
				<button type="button" onclick={() => (confirming = true)} disabled={submitting || !ready} class="{cta} {ready ? ctaOn : ctaOff}">{ctaLabel}</button>
			{:else}
				<p class="mb-2.5 text-[13px] leading-[1.5] text-white/85">{deposit ? '이 주문을 취소할까요? 되돌릴 수 없어요.' : `${won(est.amount)}을 환불할까요? 되돌릴 수 없어요.`}</p>
				<div class="flex gap-2">
					<button type="button" onclick={() => (confirming = false)} disabled={submitting} class="{cta} flex-1 border border-white/14 text-fg">아니요</button>
					<button type="button" onclick={submit} disabled={submitting} class="{cta} flex-1 {ctaOn} disabled:opacity-60">{submitting ? '처리 중…' : deposit ? '네, 취소할게요' : '네, 환불할게요'}</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
