<script lang="ts">
	import { onMount } from 'svelte';
	import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
	import { won } from '$lib/data';
	import { formatPhoneInput } from '$lib/phone';
	import { shop } from '$lib/state.svelte';
	import {
		EMPTY_GUEST_DRAFT,
		GUEST_CONSENT_TEXT,
		rejectedItemsText,
		validateGuestBuyer,
		validateShipping,
		type GuestBuyerDraft,
		type RejectedItem,
		type ShippingDraft
	} from '$lib/checkout-rules';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PaymentWidget from '$lib/components/PaymentWidget.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 주문 · 결제 — 받는 분 / (비회원: 주문자 이메일·동의) / 결제 수단(토스 결제위젯) / 주문 상품 / 금액 → [결제하기]
	 *  결제하기: 검증 → POST /api/checkout(줄 = 장바구니 · 서버가 단가·배송비·잔여 검증) → widgets.setAmount(서버 금액) → requestPayment(successUrl /checkout/success · failUrl /checkout/fail).
	 *  화면 합계는 표시용 — 결제되는 금액은 서버 응답의 amount. 한 줄이라도 거절되면(LINES_REJECTED) 어느 상품이 왜 안 되는지 보여주고 장바구니로 보낸다. */
	let { data } = $props();

	type ApiOk = { ok: true; orderId: string; amount: number; itemsAmount: number; shippingFee: number; orderName: string; phone: string; email: string | null };
	type ApiFail = { ok: false; code: string; message: string; items?: RejectedItem[] };

	let widgets: TossPaymentsWidgets | null = null;
	let ready = $state(false);
	let widgetError = $state<string | null>(null);
	let agreedRequired = $state(true);
	let submitting = $state(false);
	let blocked = $state<string | null>(null);
	let saveAddress = $state(false);

	// 프리필: 서버 기본 배송지 → 없으면 브라우저에 저장된 주문자 정보 (마운트 1회 — 이후는 사용자 입력이 진실)
	// svelte-ignore state_referenced_locally
	let draft = $state<ShippingDraft>({ ...data.defaults });
	let gdraft = $state<GuestBuyerDraft>({ ...EMPTY_GUEST_DRAFT });
	let invalid = $state<Record<string, boolean>>({});
	onMount(() => {
		if (!draft.recipient && shop.buyer.name) draft = { ...draft, recipient: shop.buyer.name };
		if (!draft.phone && shop.buyer.phone) draft = { ...draft, phone: shop.buyer.phone };
		if (!draft.address1 && shop.buyer.address) draft = { ...draft, address1: shop.buyer.address };
	});

	const items = $derived(shop.cartItems.filter((it) => it.available));
	const canPay = $derived(ready && !widgetError && !blocked && agreedRequired && !submitting && items.length > 0 && (data.guest ? gdraft.consent : true));

	function nameOf(code: string): string {
		return shop.cart.find((l) => l.product.code === code)?.product.name ?? code;
	}

	async function handlePay() {
		if (!widgets || submitting || blocked) return;
		const v = validateShipping(draft);
		if (!v.ok) {
			invalid = { [v.field]: true };
			shop.showToast(v.message);
			document.getElementById(`ck-${v.field}`)?.focus();
			return;
		}
		let guest: { name: string; phone: string; email: string | null; consent: true } | null = null;
		if (data.guest) {
			const g = validateGuestBuyer({ ...gdraft, name: gdraft.name.trim() || v.shipping.recipient, phone: gdraft.phone.trim() || v.shipping.phone });
			if (!g.ok) {
				invalid = { [`g-${g.field}`]: true };
				shop.showToast(g.message);
				return;
			}
			guest = { ...g.buyer, consent: true };
		}
		// 주문자 정보는 다음 결제의 프리필로 브라우저에 남긴다
		shop.buyer = { name: v.shipping.recipient, phone: v.shipping.phone, address: v.shipping.address1 };

		submitting = true;
		try {
			const res = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lines: items.map((it) => ({ code: it.code, qty: it.qty, optionIndex: 0 })),
					shipping: v.shipping,
					guest,
					saveAddress: data.guest ? false : saveAddress
				})
			});
			const r = (await res.json().catch(() => null)) as ApiOk | ApiFail | null;
			if (res.status === 401) {
				window.location.assign('/login?next=%2Fcheckout');
				return;
			}
			if (!res.ok || !r || r.ok !== true) {
				const code = r && r.ok === false ? r.code : '';
				const message = (r && r.ok === false && r.message) || '결제 준비에 실패했어요 — 잠시 후 다시 시도해주세요';
				if (code === 'LINES_REJECTED' && r && r.ok === false && r.items?.length) blocked = `${message}: ${rejectedItemsText(r.items, nameOf)}`;
				else if (code === 'AMOUNT_TOO_SMALL' || code === 'NO_SERVICE_KEY') blocked = message;
				else shop.showToast(message);
				submitting = false;
				return;
			}
			if (r.amount !== shop.total) shop.showToast(`결제 금액이 ${won(r.amount)}로 갱신되었어요`);
			await widgets.setAmount({ currency: 'KRW', value: r.amount });
			const origin = window.location.origin;
			await widgets.requestPayment({
				orderId: r.orderId,
				orderName: r.orderName,
				successUrl: `${origin}/checkout/success`,
				failUrl: `${origin}/checkout/fail`,
				customerName: (guest?.name ?? v.shipping.recipient).slice(0, 100),
				customerEmail: r.email || data.email || undefined,
				customerMobilePhone: r.phone || undefined
			});
		} catch (e) {
			shop.showToast(e instanceof Error && e.message ? e.message : '결제 요청에 실패했어요 — 다시 시도해주세요');
			submitting = false;
		}
	}

	const inputCls = 'h-[54px] w-full rounded-[14px] border-[1.5px] bg-white/4 px-4 text-[16px] text-fg outline-none focus:border-accent focus:bg-accent/6 lg:text-[15px]';
	const border = (k: string) => (invalid[k] ? 'border-[#ff6b6b]' : 'border-white/10');
	const payBtn = 'h-[58px] w-full rounded-2xl text-[17px] font-extrabold transition-colors duration-250 lg:h-14 lg:text-[16px]';
	const payLabel = $derived(submitting ? '결제창을 여는 중…' : `${won(shop.total)} 결제하기`);
</script>

<svelte:head><title>주문 · 결제 — MYR Shop</title></svelte:head>

<div class="flex h-full flex-col lg:mx-auto lg:block lg:h-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain lg:overflow-visible">
		<BackHeader title="주문 · 결제" />
		<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">주문 · 결제</h1>

		{#if shop.ready && items.length === 0}
			<div class="flex flex-col items-center gap-4 px-5 pt-20 text-center lg:pt-[100px]">
				<p class="text-[17px] font-bold lg:text-[20px]">담긴 상품이 없어요</p>
				<p class="text-[14px] text-fg-faint lg:text-[15px]">장바구니에 레시피를 담은 뒤 결제할 수 있어요</p>
				<a href="/category" class="mt-2 flex h-12 items-center rounded-[14px] border border-white/14 px-[22px] text-[14px] font-bold text-fg">둘러보기</a>
			</div>
		{/if}
		<!-- 비어 있으면 폼을 그리지 않는다 (class 토글은 lg:grid 가 hidden 을 이겨 PC 에서 폼이 같이 보였다) -->
		<div class="lg:mt-6 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] lg:items-start lg:gap-8" style:display={shop.ready && items.length === 0 ? 'none' : undefined}>
			<form id="checkout-form" class="px-5 pt-1.5 pb-4 lg:flex lg:flex-col lg:gap-7 lg:px-0 lg:pt-0 lg:pb-0" onsubmit={(e) => { e.preventDefault(); void handlePay(); }}>
				<div class="no-bar flex gap-2 overflow-x-auto pb-1 lg:hidden">
					{#each items as it (it.code)}
						<div class="relative shrink-0">
							<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} icon={26} class="h-14 w-14 rounded-[14px]" />
							<span class="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-[10px] border-[1.5px] border-white/15 bg-bg px-[5px] text-[11px] font-extrabold">{it.qty}</span>
						</div>
					{/each}
				</div>

				{#if data.guest}
					<div class="mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-white/8 bg-white/3 px-4 py-3 lg:mt-0">
						<p class="text-[13px] leading-[1.5] text-white/70">비회원으로 주문해요 — 주문 완료 후 <b class="text-fg">주문번호 + 연락처</b>로 조회할 수 있어요</p>
						<a href="/login?next=%2Fcheckout" class="shrink-0 text-[13px] font-bold text-accent">로그인</a>
					</div>
				{/if}

				<div>
					<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold lg:mt-0 lg:mb-3 lg:text-[17px]">받는 분</h3>
					<div class="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
						<input id="ck-recipient" bind:value={draft.recipient} placeholder="이름" autocomplete="name" aria-label="이름" disabled={submitting} class="{inputCls} {border('recipient')}" oninput={() => (invalid = {})} />
						<input
							id="ck-phone"
							value={draft.phone}
							oninput={(e) => { draft.phone = formatPhoneInput(e.currentTarget); invalid = {}; }}
							type="tel"
							inputmode="numeric"
							placeholder="010-0000-0000"
							autocomplete="tel"
							aria-label="연락처"
							disabled={submitting}
							class="{inputCls} {border('phone')} tabular-nums"
						/>
						<input id="ck-address1" bind:value={draft.address1} placeholder="주소 (동·호수까지)" autocomplete="street-address" aria-label="주소" disabled={submitting} class="{inputCls} {border('address1')} lg:col-span-2" oninput={() => (invalid = {})} />
						<input id="ck-memo" bind:value={draft.memo} placeholder="배송 메모 (선택)" aria-label="배송 메모" maxlength="100" disabled={submitting} class="{inputCls} {border('memo')} lg:col-span-2" />
					</div>
					{#if data.guest}
						<div class="mt-2.5 flex flex-col gap-2.5">
							<input id="ck-g-email" bind:value={gdraft.email} type="email" placeholder="이메일 (선택 · 주문 안내 메일)" autocomplete="email" aria-label="이메일" disabled={submitting} class="{inputCls} {border('g-email')}" />
							<label class="flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/3 px-4 py-3.5">
								<input type="checkbox" bind:checked={gdraft.consent} disabled={submitting} class="m-0 mt-0.5 h-5 w-5 shrink-0 accent-accent" />
								<span class="text-[12.5px] leading-[1.55] text-white/70"><b class="font-bold text-fg">(필수)</b> {GUEST_CONSENT_TEXT}</span>
							</label>
						</div>
					{:else}
						<label class="mt-2.5 flex cursor-pointer items-center gap-2.5 px-1 text-[13px] text-white/70">
							<input type="checkbox" bind:checked={saveAddress} disabled={submitting} class="m-0 h-[18px] w-[18px] accent-accent" />기본 배송지로 저장
						</label>
					{/if}
				</div>

				<div>
					<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold lg:mt-0 lg:mb-3 lg:text-[17px]">결제 수단</h3>
					{#if blocked}
						<div class="rounded-[14px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-4 py-3.5 text-[13px] leading-[1.55] text-white/85" role="alert">{blocked}</div>
						<a href="/cart" class="mt-3 flex h-12 items-center justify-center rounded-[14px] border border-white/14 text-[14px] font-bold text-fg">장바구니로</a>
					{:else}
						<PaymentWidget
							clientKey={data.clientKey}
							variantKey={data.variantKey}
							customerKey={data.customerKey}
							amount={shop.total}
							onReady={(w) => { widgets = w; ready = true; }}
							onError={(m) => (widgetError = m)}
							onAgreementChange={(v) => (agreedRequired = v)}
						/>
					{/if}
				</div>

				<div class="hidden lg:block">
					<h3 class="mb-3 text-[17px] font-extrabold">주문 상품</h3>
					<div class="flex flex-col gap-2">
						{#each items as it (it.code)}
							<div class="flex items-center gap-3.5 rounded-2xl border border-white/8 bg-white/3 px-3.5 py-3">
								<Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} icon={26} class="h-[52px] w-[52px] rounded-xl" />
								<span class="min-w-0 flex-1 text-[14px] font-bold">{it.name}<span class="font-semibold text-fg-faint"> × {it.qty}</span></span>
								<span class="text-[15px] font-extrabold">{won(it.lineAmount)}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="mt-6 lg:hidden">
					<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} boxed />
				</div>
			</form>

			<aside class="hidden rounded-3xl border border-white/8 bg-panel p-6 lg:sticky lg:top-[104px] lg:block">
				<p class="mb-4 text-[16px] font-extrabold">결제 금액</p>
				<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
				<p class="mt-2 text-[12px] leading-[1.5] text-fg-faint">결제 금액은 서버가 다시 계산해요 — 화면과 다르면 결제창에 서버 금액이 들어갑니다.</p>
				<button type="submit" form="checkout-form" disabled={!canPay} class="{payBtn} mt-3.5 {canPay ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/40'}">{payLabel}</button>
			</aside>
		</div>
	</div>

	<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden {shop.ready && items.length === 0 ? 'hidden' : ''}">
		<button type="submit" form="checkout-form" disabled={!canPay} class="{payBtn} {canPay ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{payLabel}</button>
	</div>
</div>
