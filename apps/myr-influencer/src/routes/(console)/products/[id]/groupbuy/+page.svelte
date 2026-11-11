<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		GB_PCT_MAX,
		GB_PCT_MIN,
		GB_STATE_META,
		groupbuyErrors,
		groupbuyHref,
		isoToKstInput,
		kstInputToIso,
		kstShort,
		remainLabel,
		type GroupbuyDraft,
		type GroupbuyField,
		type SellerGroupbuy
	} from '@sellery/myr-core/groupbuy';
	import { goBack } from '$lib/nav';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { authButton, authInput, AUTH_HINT, AUTH_LABEL } from '$lib/auth-ui';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 공구 링크(0086) — 내 제품 메뉴 → [공구 링크].
	 *  진행 중이거나 예정된 공구가 있으면: 상태 · 할인율 · 공구가 · 기간 · 링크(복사) · 판매 수량 · 주문 · 매출 · [지금 종료]
	 *  없으면: 만들기(할인율 1~70% · 시작 · 종료 — 한국 시간). 링크는 바로 만들어지고 시작 일시부터 공구가로 팔린다.
	 *  품절(재고 0)이면 만들 수 없다(재입고는 운영) · 진행 중에 품절되면 공구는 그대로 두고 안내만.
	 *  아래 "지난 공구" 에 끝난 공구가 실적과 함께 쌓인다. 실적 = 결제된 주문의 공구 줄(환불 뺀 값 · 홈 실적과 같은 기준).
	 *  모바일: 한 줄 · PC(lg~): 32px 제목 줄 + 2단(왼쪽 진행/만들기 · 오른쪽 지난 공구) */
	let { data } = $props();

	let now = $state(Date.now());
	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});
	const p = $derived(data.product);
	// 공구 상태(예정 · 진행 · 종료)는 서버 값 그대로 — 시작 · 끝 시각이 오면 다시 받는다(now 는 "N시간 남음" 글자만)
	const open = $derived(data.items.find((g) => g.state !== 'ended') ?? null);
	$effect(() => {
		if (!open) return;
		const at = Date.parse(open.state === 'scheduled' ? open.startsAt : open.endsAt);
		if (!Number.isFinite(at)) return;
		const t = setTimeout(() => void invalidateAll(), Math.min(Math.max(at - Date.now() + 1000, 0), 2_147_000_000));
		return () => clearTimeout(t);
	});
	const past = $derived(data.items.filter((g) => g !== open));
	const listed = $derived(p.status === 'listed');

	// ---- 만들기 ----
	const HOUR = 60 * 60 * 1000;
	function defaults(): GroupbuyDraft {
		const start = isoToKstInput(Date.now());
		const end = isoToKstInput(Date.now() + 3 * 24 * HOUR).slice(0, 11) + '23:59';
		return { pct: '', startsAt: start, endsAt: end };
	}
	let draft = $state<GroupbuyDraft>(untrack(defaults));
	let attempted = $state(false);
	let busy = $state(false);
	let formError = $state<string | null>(null);
	const errs = $derived(groupbuyErrors(draft, now));
	const show = (k: GroupbuyField) => (attempted ? errs[k] : undefined);
	const pctNum = $derived(/^\d{1,2}$/.test(draft.pct.trim()) ? Number(draft.pct) : null);
	// 공구가 미리보기 — 실제 공구와 같은 서버 계산(GET …/groupbuy/preview · 옵션 0번 단가) · 할인율이 바뀌면 잠깐 뒤 묻는다
	let preview = $state<{ pct: number; price: number; basePrice: number } | null>(null);
	$effect(() => {
		const pct = pctNum && pctNum >= GB_PCT_MIN && pctNum <= GB_PCT_MAX ? pctNum : null;
		const id = p.id;
		if (pct === null) {
			preview = null;
			return;
		}
		let stale = false;
		const t = setTimeout(async () => {
			try {
				const res = await fetch(`/api/products/${encodeURIComponent(id)}/groupbuy/preview?pct=${pct}`);
				const r = (await res.json().catch(() => null)) as { ok?: boolean; price?: number; basePrice?: number } | null;
				if (!stale) preview = r?.ok && typeof r.price === 'number' && typeof r.basePrice === 'number' ? { pct, price: r.price, basePrice: r.basePrice } : null;
			} catch {
				if (!stale) preview = null;
			}
		}, 200);
		return () => {
			stale = true;
			clearTimeout(t);
		};
	});

	async function create() {
		attempted = true;
		formError = null;
		const bad = (['pct', 'startsAt', 'endsAt'] as const).find((k) => !!errs[k]);
		if (bad) {
			document.getElementById(`gb-${bad}`)?.focus();
			return;
		}
		busy = true;
		try {
			const res = await fetch(`/api/products/${encodeURIComponent(p.id)}/groupbuy`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pct: Number(draft.pct), startsAt: kstInputToIso(draft.startsAt), endsAt: kstInputToIso(draft.endsAt) })
			});
			const r = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
			if (r?.ok) {
				app.showToast('공구 링크를 만들었어요');
				attempted = false;
				draft = defaults();
				await invalidateAll();
			} else formError = r?.message ?? '만들지 못했어요. 잠시 후 다시 시도해주세요';
		} catch {
			formError = '만들지 못했어요. 인터넷 연결을 확인해주세요';
		} finally {
			busy = false;
		}
	}

	// ---- 진행 중 ----
	const linkOf = (g: SellerGroupbuy) => `${data.shopOrigin}${groupbuyHref(g.code)}`;
	async function copy(g: SellerGroupbuy) {
		try {
			await navigator.clipboard.writeText(linkOf(g));
			app.showToast('링크를 복사했어요');
		} catch {
			app.showToast('복사하지 못했어요. 링크를 길게 눌러 복사해주세요');
		}
	}
	let confirmClose = $state(false);
	async function close(g: SellerGroupbuy) {
		if (!confirmClose) {
			confirmClose = true;
			return;
		}
		busy = true;
		try {
			const res = await fetch(`/api/groupbuys/${encodeURIComponent(g.code)}/close`, { method: 'POST' });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
			app.showToast(r?.ok ? '공구를 종료했어요' : (r?.message ?? '종료하지 못했어요'));
			confirmClose = false;
			await invalidateAll();
		} catch {
			app.showToast('종료하지 못했어요. 인터넷 연결을 확인해주세요');
		} finally {
			busy = false;
		}
	}

	const card = 'rounded-[20px] border border-white/8 bg-white/3 p-4 lg:rounded-3xl lg:p-6';
	const stateChip = (s: string) =>
		s === 'active' ? 'bg-accent/14 text-accent' : s === 'scheduled' ? 'bg-mint/14 text-mint' : 'bg-white/8 text-white/55';
</script>

{#snippet stats(g: SellerGroupbuy, big: boolean)}
	<div class="grid grid-cols-3 gap-2">
		{#each [{ k: '판매 수량', v: `${g.stats.units.toLocaleString('ko-KR')}개` }, { k: '주문', v: `${g.stats.orders.toLocaleString('ko-KR')}건` }, { k: '매출', v: won(g.stats.net) }] as s (s.k)}
			<div class="rounded-[14px] bg-white/4 px-3 {big ? 'py-3' : 'py-2.5'}">
				<p class="text-[11px] font-bold text-white/50">{s.k}</p>
				<p class="mt-0.5 {big ? 'text-[17px] lg:text-[19px]' : 'text-[14px]'} font-extrabold tracking-[-.01em] tabular-nums">{s.v}</p>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet productCard()}
	<div class="flex items-center gap-3">
		<Tile tile="slate" thumbUrl={p.thumbUrl} bg={p.tile} iconId={p.icon} icon={30} class="h-14 w-14 rounded-[14px]" />
		<span class="min-w-0 flex-1">
			<span class="block truncate text-[15px] font-bold">{p.name}</span>
			<span class="mt-[3px] block text-[12px] text-white/55">기본가 {won(p.price)} · 기본가는 그대로, 링크로 들어온 고객만 공구가</span>
		</span>
	</div>
{/snippet}

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="공구 링크" fallback="/products" />

	<div class="hidden items-center gap-3 lg:flex">
		<PcBack onclick={() => goBack('/products')} />
		<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">공구 링크</h1>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-10 lg:mt-7 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
		<div class="flex min-w-0 flex-col gap-3 lg:gap-4">
			<div class={card}>{@render productCard()}</div>

			{#if open}
				{@const st = open.state}
				<section class={card} aria-label="진행 중인 공구">
					<div class="flex items-center gap-2">
						<span class="rounded-[7px] px-[9px] py-1 text-[12px] font-extrabold {stateChip(st)}">{GB_STATE_META[st].label}</span>
						<span class="text-[13px] font-semibold text-white/60">{st === 'active' ? remainLabel(open.endsAt, now) : `${kstShort(open.startsAt)} 시작`}</span>
					</div>
					<div class="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
						<span class="text-[28px] font-extrabold tracking-[-.02em] text-accent lg:text-[32px]">{won(open.price)}</span>
						<span class="text-[14px] font-bold text-white/40 line-through">{won(open.options[0]?.price ?? p.price)}</span>
						<span class="text-[14px] font-extrabold text-white/80">{open.discountPct}% 할인</span>
					</div>
					<p class="mt-1.5 text-[13px] text-white/55 tabular-nums">{kstShort(open.startsAt)} ~ {kstShort(open.endsAt)} · 한국 시간</p>

					<div class="mt-4 flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/4 py-1.5 pr-1.5 pl-3.5">
						<span class="min-w-0 flex-1 truncate text-[14px] font-semibold text-white/85 select-all">{linkOf(open)}</span>
						<button type="button" onclick={() => copy(open)} class="h-9 shrink-0 rounded-[10px] bg-accent px-3.5 text-[13px] font-extrabold text-bg hover:bg-[#ff8f5c]">복사</button>
					</div>
					{#if p.soldOut}<p class="mt-2.5 rounded-[12px] bg-[#ff6b6b]/10 px-3 py-2 text-[13px] font-semibold text-[#ff8a8a]">지금 품절이라 링크로 들어와도 살 수 없어요 · 재고가 들어오면 공구가로 다시 팔려요</p>{/if}
					<p class="mt-2 {AUTH_HINT}">{st === 'scheduled' ? '지금 공유해도 돼요 — 시작 전에는 기본가와 "공구 예정" 안내가 보여요' : '이 링크로 들어온 고객에게만 공구가가 보여요'}</p>

					<div class="mt-4">{@render stats(open, true)}</div>

					<div class="mt-4 flex gap-2">
						{#if confirmClose}
							<button type="button" onclick={() => (confirmClose = false)} disabled={busy} class="h-12 flex-1 rounded-[14px] border border-white/14 text-[14px] font-bold text-fg">취소</button>
							<button type="button" onclick={() => close(open)} disabled={busy} class="h-12 flex-1 rounded-[14px] bg-[#ff6b6b] text-[14px] font-extrabold text-white disabled:opacity-60">{busy ? '종료하는 중…' : '정말 종료하기'}</button>
						{:else}
							<button type="button" onclick={() => close(open)} class="h-12 w-full rounded-[14px] border border-[#ff6b6b]/40 text-[14px] font-bold text-[#ff8a8a] transition-colors hover:bg-[#ff6b6b]/8">지금 종료</button>
						{/if}
					</div>
					{#if confirmClose}<p class="mt-2 text-center {AUTH_HINT}">종료하면 바로 기본가로 돌아가요 · 되돌릴 수 없어요</p>{/if}
				</section>
			{:else if !listed}
				<p class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-[14px] leading-[1.55] text-white/70">판매 중인 제품만 공구 링크를 만들 수 있어요.</p>
			{:else if p.soldOut}
				<p class="rounded-[18px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-4 py-3.5 text-[14px] leading-[1.55] text-white/80">품절된 제품은 공구 링크를 만들 수 없어요. 재고가 들어오면 만들 수 있어요.</p>
			{:else}
				<form class="{card} flex flex-col gap-4" onsubmit={(e) => (e.preventDefault(), create())} novalidate>
					<div>
						<h2 class="text-[17px] font-extrabold lg:text-[19px]">공구 링크 만들기</h2>
						<p class="mt-1 {AUTH_HINT}">링크는 바로 만들어지고, 시작 일시부터 종료 일시까지 공구가로 팔려요. 수량 제한은 없어요.</p>
					</div>
					<label class="flex flex-col gap-1.5">
						<span class={AUTH_LABEL}>할인율</span>
						<span class="relative">
							<input
								id="gb-pct"
								inputmode="numeric"
								maxlength="2"
								placeholder="{GB_PCT_MIN}~{GB_PCT_MAX}"
								value={draft.pct}
								oninput={(e) => {
									draft.pct = e.currentTarget.value.replace(/\D/g, '').slice(0, 2);
									e.currentTarget.value = draft.pct;
									formError = null;
								}}
								class="{authInput({ invalid: !!show('pct'), filled: !!draft.pct, size: 'md', padRight: true })} tabular-nums"
							/>
							<span class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[15px] font-bold text-white/55">%</span>
						</span>
						{#if show('pct')}<span class="text-[12px] font-semibold text-accent">{show('pct')}</span>
						{:else if preview !== null && preview.pct === pctNum}<span class="text-[13px] text-white/70">공구가 <b class="font-extrabold text-accent">{won(preview.price)}</b> <span class="text-white/45">(기본가 {won(preview.basePrice)})</span></span>{/if}
					</label>
					<div class="grid gap-4 lg:grid-cols-2">
						<label class="flex flex-col gap-1.5">
							<span class={AUTH_LABEL}>시작</span>
							<input id="gb-startsAt" type="datetime-local" bind:value={draft.startsAt} oninput={() => (formError = null)} class="{authInput({ invalid: !!show('startsAt'), filled: !!draft.startsAt, size: 'md' })} [color-scheme:dark]" />
							{#if show('startsAt')}<span class="text-[12px] font-semibold text-accent">{show('startsAt')}</span>{/if}
						</label>
						<label class="flex flex-col gap-1.5">
							<span class={AUTH_LABEL}>종료</span>
							<input id="gb-endsAt" type="datetime-local" bind:value={draft.endsAt} oninput={() => (formError = null)} class="{authInput({ invalid: !!show('endsAt'), filled: !!draft.endsAt, size: 'md' })} [color-scheme:dark]" />
							{#if show('endsAt')}<span class="text-[12px] font-semibold text-accent">{show('endsAt')}</span>{/if}
						</label>
					</div>
					<p class={AUTH_HINT}>한국 시간이에요. 시작을 지난 시각으로 고르면 지금부터 시작해요.</p>
					{#if formError}<p class="text-center text-[13px] font-semibold text-accent" role="alert">{formError}</p>{/if}
					<button type="submit" disabled={busy} class="{authButton(!busy)} disabled:cursor-not-allowed">{busy ? '만드는 중…' : '링크 만들기'}</button>
				</form>
			{/if}
		</div>

		<section class="mt-7 lg:mt-0" aria-label="지난 공구">
			<h2 class="mb-2.5 text-[14px] font-extrabold text-white/80 lg:mb-3 lg:text-[15px]">지난 공구 <span class="text-white/45">{past.length}건</span></h2>
			{#if past.length}
				<ul class="flex flex-col gap-2.5">
					{#each past as g (g.code)}
						<li class="rounded-[18px] border border-white/8 bg-white/3 p-4">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span class="text-[16px] font-extrabold tabular-nums">{won(g.price)}</span>
								<span class="text-[13px] font-bold text-white/60">{g.discountPct}% 할인</span>							</div>
							<!-- 예정 공구를 시작 전에 종료하면 끝이 시작보다 앞선다 — 기간 대신 "시작 예정 · 시작 전 종료" -->
							<p class="mt-1 text-[12px] text-white/50 tabular-nums">
								{Date.parse(g.endsAt) <= Date.parse(g.startsAt) ? `${kstShort(g.startsAt)} 시작 예정 · 시작 전 종료` : `${kstShort(g.startsAt)} ~ ${kstShort(g.endsAt)}`}
							</p>
							<div class="mt-3">{@render stats(g, false)}</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/45">끝난 공구가 여기에 실적과 함께 남아요</p>
			{/if}
		</section>
	</div>
</div>
