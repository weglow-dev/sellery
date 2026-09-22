<script lang="ts">
	/**
	 * 체크아웃 화면 (ux-spec §3.4 · app-plan §7.1 브라우저 단계 · web checkout/checkout-client.tsx 1:1).
	 *   좌: 주문 상품 · 배송 정보 · 결제 수단(#payment-method) · 약관 동의(#agreement + 통신판매중개자 확인)
	 *   우: 결제 금액 박스 + [₩{total} 결제하기] · ≤640px 는 하단 고정 결제 바
	 * 결제하기: 배송지 검증(토스트) → 통신판매중개자 체크 → POST /api/checkout → 응답 {orderId, amount, orderName, phone, email} 로
	 *   widgets.setAmount(amount) → requestPayment({ successUrl: origin + "/checkout/success", failUrl: origin + "/checkout/fail?c&o&q",
	 *   customerName: recipient, customerEmail?, customerMobilePhone: phone(서버 정규화값 — 숫자만) }).
	 * 금액은 서버가 계산한다 — 클라이언트 합계는 표시용, 결제되는 값은 응답의 amount (reuse-map §4-4).
	 * 진입 시 sessionStorage[RETURN_KEY] = { store, retry } — successUrl 은 쿼리 없이 고정이라 성공 페이지가 복귀 링크에 쓴다.
	 * 401 → 세션 만료: /login?next=<retry> · NOT_LIVE/SOLD_OUT/NOT_FOUND → 위젯 대신 안내.
	 * 비회원(guest, 0021): 맨 위 "주문자 정보" 카드(이름·연락처·이메일(선택)·개인정보 동의 /privacy#guest) → 본문 `guest:{…}` 로 전송 · 받는 분/연락처가 비어 있으면 주문자 값으로 채움
	 *   · customerKey 는 토스 ANONYMOUS · "기본 배송지로 저장" 없음 · failUrl 에 &g=1 (다시 시도가 비회원 모드로).
	 */
	import { onMount } from 'svelte';
	import { PUBLIC_TOSS_CLIENT_KEY } from '$env/static/public';
	import { env } from '$env/dynamic/public';
	import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
	import { won, type CampaignCard } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { EMPTY_GUEST_DRAFT, GUEST_CONSENT_TEXT, GUEST_EMAIL_MAX, GUEST_NAME_MAX, PRIVACY_GUEST_HREF, validateGuestBuyer, type GuestBuyerDraft, type GuestBuyerField } from '@sellery/db/guest-order';
	import {
		checkoutHref,
		mediatorText,
		PRIVACY_THIRD_PARTY_HREF,
		RETURN_KEY,
		thirdPartyText,
		validateShipping,
		type ShippingDraft,
		type ShippingField
	} from '@sellery/payments/checkout-rules';
	import { AddressFields, Field, OrderSummary, PayBar, PaymentWidget, PlatIcon, ProductIcon, showToast } from '@sellery/ui/site';

	type CheckoutApiOk = { ok: true; sessionId: string; orderId: string; amount: number; orderName: string; customerKey: string; phone: string; email: string | null };
	type CheckoutApiFail = { ok: false; code: string; message: string };

	let {
		card,
		optionIndex,
		qty,
		guest = false,
		customerKey,
		email,
		defaults,
		storeUrl
	}: {
		card: CampaignCard;
		optionIndex: number;
		qty: number;
		/** 비회원 구매 모드 (0021) */
		guest?: boolean;
		/** 토스 customerKey = user.id (비회원은 ANONYMOUS) */
		customerKey: string;
		email: string | null;
		defaults: ShippingDraft;
		storeUrl: string;
	} = $props();

	const product = $derived(card.product);
	const seller = $derived(card.seller);
	const brand = $derived(card.brand);
	const campaign = $derived(card.campaign);
	const option = $derived(product.options[Math.min(optionIndex, product.options.length - 1)]);
	const total = $derived(option.price * qty);
	const variantKey = env.PUBLIC_TOSS_WIDGET_VARIANT || 'DEFAULT-2';

	let widgets: TossPaymentsWidgets | null = null;
	let ready = $state(false);
	let widgetError = $state<string | null>(null);
	let submitting = $state(false);
	/** NOT_LIVE / SOLD_OUT 등 결제를 더 진행할 수 없는 서버 응답 — 위젯 대신 안내 */
	let blocked = $state<string | null>(null);
	let agreedRequired = $state(true); // 토스 약관 UI 가 이벤트를 주기 전에는 위젯 자체가 거절하도록 둔다
	let agreeMediator = $state(false);
	let saveAddress = $state(false);

	// 프리필은 마운트 시 1회 (web useState(defaults) 와 동일 — 이후는 사용자 입력이 진실)
	// svelte-ignore state_referenced_locally
	let draft = $state<ShippingDraft>({ ...defaults });
	let invalid = $state<Partial<Record<ShippingField, boolean>>>({});
	const patchDraft = (patch: Partial<ShippingDraft>) => {
		draft = { ...draft, ...patch };
	};
	const clearInvalid = (f: ShippingField) => {
		if (invalid[f]) invalid = { ...invalid, [f]: false };
	};

	// 비회원 주문자 정보 (guest 일 때만 렌더·검증)
	let gdraft = $state<GuestBuyerDraft>({ ...EMPTY_GUEST_DRAFT });
	let ginvalid = $state<Partial<Record<GuestBuyerField, boolean>>>({});
	const setGuest = (f: 'name' | 'phone' | 'email') => (v: string) => {
		gdraft = { ...gdraft, [f]: v };
		if (ginvalid[f]) ginvalid = { ...ginvalid, [f]: false };
	};

	const onReady = (w: TossPaymentsWidgets) => {
		widgets = w;
		ready = true;
	};
	const onWidgetError = (m: string) => (widgetError = m);
	const onAgreementChange = (v: boolean) => (agreedRequired = v);

	// 결제창 진입 뒤 성공 페이지가 "판매 페이지로"·"다시 시도" 링크에 쓸 복귀 정보 (successUrl 은 쿼리 없이 고정 — rules.RETURN_KEY)
	const retryHref = $derived(checkoutHref(campaign.code, optionIndex, qty, guest));
	onMount(() => {
		try {
			window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ store: storeUrl, retry: retryHref }));
		} catch {
			/* 저장 불가(프라이빗 모드 등) — 성공 페이지가 홈으로 대체 */
		}
	});

	async function handlePay() {
		if (!widgets || submitting || blocked) return;

		let guestBody: { name: string; phone: string; email: string | null; consent: true } | null = null;
		if (guest) {
			const g = validateGuestBuyer(gdraft);
			if (!g.ok) {
				ginvalid = { [g.field]: true };
				showToast(g.message);
				document.getElementById(`ck-g-${g.field}`)?.focus();
				return;
			}
			guestBody = { ...g.buyer, consent: true };
			// 받는 분·연락처가 비어 있으면 주문자 값으로 (본인 수령이 대부분)
			if (!draft.recipient.trim() || !draft.phone.trim()) {
				draft = { ...draft, recipient: draft.recipient.trim() || g.buyer.name, phone: draft.phone.trim() || g.buyer.phone };
			}
		}

		const v = validateShipping(draft);
		if (!v.ok) {
			invalid = { [v.field]: true };
			showToast(v.message);
			document.getElementById(`ck-${v.field}`)?.focus();
			return;
		}
		if (!agreeMediator) {
			showToast('통신판매중개자 확인에 동의해주세요');
			document.getElementById('ck-mediator')?.focus();
			return;
		}

		submitting = true;
		try {
			const res = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					code: campaign.code,
					optionIndex,
					qty,
					recipient: v.shipping.recipient,
					phone: v.shipping.phone,
					postcode: v.shipping.postcode,
					address1: v.shipping.address1,
					address2: v.shipping.address2 ?? '',
					memo: v.shipping.memo ?? '',
					saveAddress: guest ? false : saveAddress,
					guest: guestBody
				})
			});
			const data = (await res.json().catch(() => null)) as CheckoutApiOk | CheckoutApiFail | null;

			if (res.status === 401) {
				// 결제 도중 세션 만료 — 로그인 후 이 화면으로 복귀
				window.location.assign(`/login?next=${encodeURIComponent(retryHref)}`);
				return;
			}
			if (!res.ok || !data || data.ok !== true) {
				const code = data && data.ok === false ? data.code : '';
				const message = (data && data.ok === false && data.message) || '결제 준비에 실패했어요 — 잠시 후 다시 시도해주세요';
				if (code === 'NOT_LIVE' || code === 'SOLD_OUT' || code === 'NOT_FOUND') blocked = message;
				else showToast(message);
				submitting = false;
				return;
			}

			// 결제되는 금액은 서버 값 — 화면 합계와 다르면 위젯 금액을 서버 값으로 맞춘다
			if (data.amount !== total) showToast(`결제 금액이 ${won(data.amount)}로 갱신되었어요`);
			await widgets.setAmount({ currency: 'KRW', value: data.amount });

			const origin = window.location.origin;
			const failQs = `c=${encodeURIComponent(campaign.code)}&o=${optionIndex}&q=${qty}${guest ? '&g=1' : ''}`;
			await widgets.requestPayment({
				orderId: data.orderId,
				orderName: data.orderName,
				successUrl: `${origin}/checkout/success`,
				failUrl: `${origin}/checkout/fail?${failQs}`,
				customerName: (guestBody?.name ?? v.shipping.recipient).slice(0, 100),
				customerEmail: data.email || email || undefined,
				customerMobilePhone: data.phone || undefined
			});
			// Redirect 방식: 여기 아래는 결제창이 닫히지 않는 한 실행되지 않는다
		} catch (e) {
			const message = e instanceof Error && e.message ? e.message : '결제 요청에 실패했어요 — 다시 시도해주세요';
			showToast(message);
			submitting = false;
		}
	}

	const payDisabled = $derived(!ready || !!widgetError || !!blocked || !agreedRequired);
	const pay = $derived({ total, disabled: payDisabled, submitting, onPay: handlePay });
</script>

<div class="max-[640px]:pb-24">
	<h2 class="pg">결제하기 <small>기간 한정 가격 — 판매가 끝난 상품은 결제에서 자동으로 빠집니다</small></h2>

	<div class="cartgrid">
		<div>
			{#if guest}
				<!-- 비회원 주문자 정보 (0021) -->
				<div class="card static">
					<h4>주문자 정보 <small style="font-weight:400;color:var(--color-mute);font-size:11.5px">비회원 · 주문 조회에 씁니다</small></h4>
					<div class="notice" style="margin:0 0 10px;font-size:12.5px">주문 완료 후 <b>주문번호 + 연락처</b>로 <a href="/orders/lookup" class="underline underline-offset-2" target="_blank" rel="noopener">주문 조회</a>·환불·문의를 할 수 있어요. 연락처를 정확히 입력해주세요.</div>
					<Field id="ck-g-name" label="주문자 이름" value={gdraft.name} onChange={setGuest('name')} invalid={!!ginvalid.name} maxlength={GUEST_NAME_MAX} autocomplete="name" disabled={submitting} />
					<Field id="ck-g-phone" label="주문자 연락처" value={gdraft.phone} onChange={setGuest('phone')} invalid={!!ginvalid.phone} type="tel" inputmode="numeric" placeholder="01012345678" autocomplete="tel" disabled={submitting} hint="주문 조회 시 이 번호를 입력합니다" />
					<Field id="ck-g-email" label="이메일" optional value={gdraft.email} onChange={setGuest('email')} invalid={!!ginvalid.email} type="email" maxlength={GUEST_EMAIL_MAX} autocomplete="email" disabled={submitting} />
					<label for="ck-g-consent" style="display:flex;align-items:flex-start;gap:6px;font-size:12.5px;line-height:1.55;cursor:pointer;margin-top:4px">
						<input id="ck-g-consent" type="checkbox" bind:checked={gdraft.consent} disabled={submitting} style="margin-top:3px" aria-invalid={ginvalid.consent || undefined} />
						<span>{GUEST_CONSENT_TEXT} (<a href={PRIVACY_GUEST_HREF} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">자세히</a>)</span>
					</label>
				</div>
			{/if}
			<!-- 주문 상품 -->
			<div class="card static">
				<h4>주문 상품</h4>
				<div class="rowitem cart-row" style="padding:6px 0 2px;border-bottom:0">
					<ProductIcon thumbUrl={product.thumb_url} emoji={product.emoji} size={48} />
					<div class="grow">
						<div class="nm">{product.name} <span class="sub">· {brand.name}</span></div>
						<div class="sub">{option.n} · <PlatIcon platform={seller.platform} /> {seller.name} {seller.handle}{campaign.end_date ? ` · ${md(campaign.end_date)} 마감` : ''}</div>
					</div>
					<div class="cart-sum">{won(total)}</div>
				</div>
				<div class="meta" style="margin-top:6px">수량 {qty}개 · 수량·옵션 변경은 <a href={storeUrl} style="text-decoration:underline">판매 페이지</a>에서</div>
			</div>

			<!-- 배송 정보 -->
			<div class="card static">
				<h4>배송 정보</h4>
				<AddressFields value={draft} onChange={patchDraft} {invalid} {clearInvalid} disabled={submitting} />
				{#if guest}
					<div class="meta">받는 분·연락처를 비워 두면 주문자 정보로 채워요</div>
				{:else}
					<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
						<input type="checkbox" bind:checked={saveAddress} disabled={submitting} />
						기본 배송지로 저장
					</label>
				{/if}
			</div>

			<!-- 결제 수단 · 약관 동의 (토스 위젯) -->
			{#if blocked}
				<div class="card static">
					<div class="notice danger" role="alert" style="margin:0 0 10px">{blocked}</div>
					<a href={storeUrl} class="btn ghost sm">← 판매 페이지로</a>
				</div>
			{:else}
				<PaymentWidget clientKey={PUBLIC_TOSS_CLIENT_KEY} {variantKey} {customerKey} amount={total} {onReady} onError={onWidgetError} {onAgreementChange}>
					{#snippet agreementExtra()}
						<label for="ck-mediator" style="display:flex;align-items:flex-start;gap:6px;font-size:12.5px;line-height:1.55;cursor:pointer">
							<input id="ck-mediator" type="checkbox" bind:checked={agreeMediator} disabled={submitting} style="margin-top:3px" />
							<span>
								{mediatorText(brand.name)}. {thirdPartyText(brand.name)} (<a href={PRIVACY_THIRD_PARTY_HREF} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">자세히</a>)
							</span>
						</label>
					{/snippet}
				</PaymentWidget>
			{/if}
		</div>

		<OrderSummary summary={{ productName: product.name, qty, total, clearDays: card.settings.clear_days }} {pay} />
	</div>

	<PayBar {...pay} />
</div>
