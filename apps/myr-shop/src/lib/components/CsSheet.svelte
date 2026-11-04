<script lang="ts">
	/** 크리에이터에게 문의하기 — 상품 페이지에서 여는 시트(대표 시안 2026-11-02). PC = 가운데 모달 · 모바일 = 아래에서 올라오는 시트.
	 *  상품 카드 · 문의 유형 칩 · (배송 문의 · 교환·반품 일 때만) 주문번호 콤보박스(내 주문 중 이 상품이 있는 것 · 직접 입력 가능) · 내용 · 안내 · [문의 보내기].
	 *  POST /api/cs → 닫고 토스트. 상품 페이지(회원): 주문 목록은 열 때 GET /api/cs/orders 로(상품이 바뀌면 다시).
	 *  주문 상세(회원·비회원): preset 으로 그 주문을 고정해 넘긴다 — 목록 = 그 주문 하나 · 유형과 무관하게 그 주문에 연결 · 비회원은 서버가 주문 조회 토큰으로 확인. */
	import { tick } from 'svelte';
	import { shop } from '$lib/state.svelte';
	import { CS_BODY_MAX, CS_PLACEHOLDERS, CS_TYPES, csNeedsOrder, type CsOrderOption, type CsType } from '@sellery/myr-core/cs-rules';
	import Tile from '$lib/components/Tile.svelte';

	type P = { code: string; name: string; tile: string; ic: string; thumbUrl: string | null };
	let { open = $bindable(false), product, creator, preset = null, onSent }: { open?: boolean; product: P; creator: { name: string; handle: string }; preset?: CsOrderOption | null; onSent?: () => void } = $props();
	let loadedFor = '';

	let type = $state<CsType>('배송 문의');
	let orderCode = $state('');
	let body = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let orders = $state<CsOrderOption[] | null>(null);
	let listOpen = $state(false);
	let panel = $state<HTMLDivElement | null>(null);

	const needsOrder = $derived(csNeedsOrder(type));
	const canSend = $derived(!submitting && body.trim().length > 0 && body.length <= CS_BODY_MAX);
	const filtered = $derived((orders ?? []).filter((o) => !orderCode.trim() || o.label.toLowerCase().includes(orderCode.trim().toLowerCase())));

	$effect(() => {
		if (!open) return;
		error = null;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		tick().then(() => panel?.focus());
		const key = preset ? `preset:${preset.code}:${product.code}` : product.code;
		if (loadedFor !== key) {
			loadedFor = key;
			body = '';
			type = '배송 문의';
			if (preset) {
				orders = [preset];
				orderCode = preset.code.toUpperCase();
			} else {
				orders = null;
				orderCode = '';
				const code = product.code;
				fetch(`/api/cs/orders?product=${encodeURIComponent(code)}`)
					.then((r) => r.json())
					.then((j: { orders?: CsOrderOption[] }) => {
						if (loadedFor === code) orders = Array.isArray(j?.orders) ? j.orders : [];
					})
					.catch(() => (orders = []));
			}
		}
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function close() {
		if (submitting) return;
		open = false;
		listOpen = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (listOpen) listOpen = false;
		else close();
	}
	function pick(o: CsOrderOption) {
		orderCode = o.code.toUpperCase();
		listOpen = false;
	}
	async function send() {
		if (!canSend) return;
		submitting = true;
		error = null;
		try {
			const res = await fetch('/api/cs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ productCode: product.code, type, body, order_code: preset ? preset.code : needsOrder ? orderCode.trim() : '' })
			});
			const r = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
			if (!res.ok || !r?.ok) {
				error = r?.message ?? '잠시 후 다시 시도해주세요';
				submitting = false;
				return;
			}
			submitting = false;
			open = false;
			body = '';
			if (!preset) orderCode = '';
			loadedFor = '';
			if (onSent) onSent();
			shop.showToast('문의를 보냈어요 · 답변은 마이페이지에서 확인할 수 있어요');
		} catch {
			error = '잠시 후 다시 시도해주세요';
			submitting = false;
		}
	}
	const chipCls = (on: boolean) => `h-9 rounded-full border px-3.5 text-[13px] font-bold transition-colors ${on ? 'border-accent bg-accent/10 text-accent' : 'border-white/14 text-fg hover:border-white/30'}`;
	const label = 'mb-2 block text-[13px] font-bold text-fg-soft';
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
	<div class="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
		<button type="button" aria-label="닫기" class="absolute inset-0 animate-toast cursor-default bg-black/65" onclick={close}></button>
		<div
			bind:this={panel}
			role="dialog"
			aria-modal="true"
			aria-labelledby="cs-sheet-title"
			tabindex="-1"
			class="relative flex max-h-[92vh] w-full animate-up-in flex-col overflow-y-auto rounded-t-[26px] border border-white/10 bg-[#141519] px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none lg:max-w-[576px] lg:rounded-[26px] lg:px-7 lg:pt-7 lg:pb-7"
		>
			<span class="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden="true"></span>
			<div class="flex items-center justify-between">
				<h2 id="cs-sheet-title" class="text-[17px] font-extrabold tracking-[-.02em] lg:text-[19px]">크리에이터에게 문의하기</h2>
				<button type="button" onclick={close} aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/8 text-fg">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
			</div>

			<div class="mt-4 flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/3 p-3">
				<Tile tile={product.tile} ic={product.ic} thumbUrl={product.thumbUrl} alt="" icon={24} class="h-[52px] w-[52px] rounded-xl" />
				<div class="min-w-0">
					<p class="truncate text-[11.5px] font-bold text-accent">{creator.name} · {creator.handle}</p>
					<p class="truncate text-[14px] font-bold">{product.name}</p>
				</div>
			</div>

			<p class="mt-5 {label}">문의 유형</p>
			<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="문의 유형">
				{#each CS_TYPES as t (t)}
					<button type="button" role="radio" aria-checked={type === t} onclick={() => (type = t)} disabled={submitting} class={chipCls(type === t)}>{t}</button>
				{/each}
			</div>

			{#if needsOrder}
				<label for="cs-order" class="mt-5 {label}">주문번호</label>
				<div class="relative">
					<input
						id="cs-order"
						bind:value={orderCode}
						onfocus={() => (listOpen = true)}
						oninput={() => (listOpen = true)}
						placeholder="주문을 선택하거나 입력하세요"
						autocomplete="off"
						maxlength="32"
						disabled={submitting}
						readonly={!!preset}
						role="combobox"
						aria-expanded={listOpen}
						aria-controls="cs-order-list"
						class="h-[52px] w-full rounded-[14px] border bg-white/4 pr-11 pl-4 text-[15px] text-fg uppercase outline-none placeholder:normal-case placeholder:text-fg-faint focus:border-accent {listOpen ? 'border-accent' : 'border-white/10'}"
					/>
					<button type="button" aria-label="주문 목록" onclick={() => (listOpen = !listOpen)} class="absolute top-0 right-0 flex h-[52px] w-11 items-center justify-center text-fg-faint">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-transform {listOpen ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
					</button>
					{#if listOpen}
						<ul id="cs-order-list" role="listbox" class="absolute top-[calc(100%+6px)] right-0 left-0 z-10 max-h-[220px] overflow-y-auto rounded-[14px] border border-white/10 bg-[#1b1c21] shadow-[0_12px_32px_rgba(0,0,0,.45)]">
							{#if orders === null}
								<li class="px-4 py-3 text-[13px] text-fg-faint">불러오는 중…</li>
							{:else if filtered.length === 0}
								<li class="px-4 py-3 text-[13px] leading-[1.5] text-fg-faint">{orders.length ? '맞는 주문이 없어요 — 주문번호를 그대로 입력해도 돼요' : '이 상품을 주문한 내역이 없어요 — 주문번호를 알면 직접 입력하세요'}</li>
							{:else}
								{#each filtered as o (o.code)}
									<li role="option" aria-selected={orderCode.toLowerCase() === o.code}>
										<button type="button" onclick={() => pick(o)} class="w-full border-b border-white/6 px-4 py-3 text-left text-[13.5px] text-fg last:border-b-0 hover:bg-white/5">{o.label}</button>
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				</div>
			{/if}

			<label for="cs-body" class="mt-5 {label}">문의 내용</label>
			<textarea id="cs-body" bind:value={body} onfocus={() => (listOpen = false)} rows="5" maxlength={CS_BODY_MAX} placeholder={CS_PLACEHOLDERS[type]} disabled={submitting} class="w-full resize-none rounded-[14px] border border-white/10 bg-white/4 px-4 py-3.5 text-[15px] leading-[1.55] text-fg outline-none placeholder:text-fg-faint focus:border-accent"></textarea>
			<p class="mt-2.5 text-[12px] leading-[1.55] text-fg-faint">답변은 {creator.name}이(가) 직접 남기고, 알림으로 알려드려요. 보통 1영업일 안에 답변돼요.</p>

			{#if error}<p role="alert" class="mt-3 rounded-[12px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[13px] text-white/85">{error}</p>{/if}
			<button type="button" onclick={send} disabled={!canSend} class="mt-5 h-14 w-full shrink-0 rounded-[16px] text-[16px] font-extrabold transition-colors {canSend ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{submitting ? '보내는 중…' : '문의 보내기'}</button>
		</div>
	</div>
{/if}
