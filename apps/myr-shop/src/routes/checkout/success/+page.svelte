<script lang="ts">
	/** 성공 URL 랜딩 — POST /api/payments/confirm 을 정확히 1회(409 면 1.5초 뒤 1회 재시도 · 401 이면 로그인 뒤 복귀) → 주문 완료 / 입금 대기 / 실패 뷰.
	 *  주문 완료 뷰는 옛 /checkout/done 디자인 그대로(주문 내역 · 배송 정보). 성공하면 브라우저 장바구니를 비운다(계정 장바구니는 confirm 이 비웠다). */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import { depositInfoOf, failText, guestOrderHref, parseSuccessParams, type DepositInfo, type FailText, type RejectedItem } from '$lib/checkout-rules';

	type Card = { orderCode: string; orderName: string; itemsAmount: number; shippingFee: number; amount: number; buyerName: string; address: string; items: { name: string; option: string; qty: number; amount: number }[] };
	type ConfirmOk = { ok: true; orderCode: string; status: string; already?: boolean; card: Card | null; deposit?: DepositInfo | null; guest?: boolean };
	type ConfirmFail = { ok: false; code: string; message?: string; items?: RejectedItem[] };
	type View = { kind: 'loading' } | { kind: 'ok'; r: ConfirmOk; amount: number } | { kind: 'fail'; code: string; fail: FailText };

	const sp = page.url.searchParams;
	const parsed = parseSuccessParams(sp.get('paymentKey'), sp.get('orderId'), sp.get('amount'));
	let view = $state<View>(parsed ? { kind: 'loading' } : { kind: 'fail', code: 'BAD_REQUEST', fail: failText('BAD_REQUEST') });
	let confirmed = false;

	async function post(body: { paymentKey: string; orderId: string; amount: number }) {
		const res = await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
		return { status: res.status, data: (await res.json().catch(() => null)) as ConfirmOk | ConfirmFail | null };
	}

	onMount(() => {
		if (!parsed || confirmed) return;
		confirmed = true;
		void (async () => {
			let r = await post(parsed);
			if (r.status === 409) {
				await new Promise((ok) => setTimeout(ok, 1500));
				r = await post(parsed);
			}
			if (r.status === 401) {
				window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
				return;
			}
			if (r.status >= 200 && r.status < 300 && r.data?.ok === true) {
				view = { kind: 'ok', r: r.data, amount: parsed.amount };
				if (!r.data.already) shop.afterOrder();
				return;
			}
			const d = r.data;
			const code = d && d.ok === false && d.code ? d.code : r.status === 409 ? 'CONFIRMING' : 'UNKNOWN';
			view = { kind: 'fail', code, fail: failText(code, d && d.ok === false ? d.message : undefined) };
		})().catch((e: unknown) => {
			console.error('[checkout/success] confirm failed', e);
			view = { kind: 'fail', code: 'CONFIRMING', fail: failText('CONFIRMING') };
		});
	});

	const dueText = (d: DepositInfo | null | undefined) => (d?.due ? new Date(d.due).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
	void depositInfoOf;
</script>

<svelte:head>
	<title>{view.kind === 'ok' ? '주문 완료' : view.kind === 'fail' ? '결제 확인' : '결제 확인 중'} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex h-full animate-slide-in flex-col lg:mx-auto lg:h-auto lg:max-w-[760px] lg:animate-up-in lg:px-10 lg:pt-[72px] lg:pb-20 lg:text-center">
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-16 pb-5 lg:overflow-visible lg:px-0 lg:pt-0">
		{#if view.kind === 'loading'}
			<p class="mt-10 text-center text-[15px] text-fg-soft" role="status" aria-live="polite">결제를 확인하고 있어요…</p>
		{:else if view.kind === 'fail'}
			{@const pending = view.fail.kind === 'pending'}
			<div class="flex h-16 w-16 items-center justify-center rounded-full {pending ? 'bg-white/10' : 'bg-[#ff6b6b]/15'} lg:mx-auto lg:h-[72px] lg:w-[72px]">
				<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={pending ? '#fff' : '#ff6b6b'} stroke-width="2.6" stroke-linecap="round" aria-hidden="true">{#if pending}<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />{:else}<path d="M6 6l12 12M18 6L6 18" />{/if}</svg>
			</div>
			<h1 class="mt-[22px] text-[26px] leading-[1.3] font-extrabold tracking-[-.03em] lg:text-[32px]">{pending ? '결제 확인 중' : '주문을 완료하지 못했어요'}</h1>
			<p class="mt-2.5 text-[15px] leading-[1.6] text-fg-soft">{view.fail.text}</p>
			{#if view.fail.money}<p class="mt-1.5 text-[13px] text-fg-faint">결제 상태: {view.fail.money}</p>{/if}
			<p class="mt-1 font-mono text-[11px] text-fg-faint">코드 {view.code}</p>
		{:else}
			{@const r = view.r}
			{@const card = r.card}
			{@const waiting = r.status === 'WAITING_DEPOSIT'}
			<div class="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-accent lg:mx-auto lg:h-[72px] lg:w-[72px]">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			</div>
			<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-.03em] lg:mt-6 lg:text-[36px] lg:leading-[1.25]">{waiting ? '입금을 기다리고 있어요' : '주문이 완료됐어요'}</h1>
			<p class="mt-2.5 text-[15px] leading-[1.6] text-fg-soft lg:mt-3 lg:text-[16px]">
				{#if card?.buyerName}{card.buyerName}님, {/if}주문번호 <b class="font-bold text-fg">{r.orderCode.toUpperCase()}</b>
				{#if waiting}<br class="lg:hidden" /><span class="hidden lg:inline"> · </span>입금이 확인되면 주문이 확정돼요.{:else}<br class="lg:hidden" /><span class="hidden lg:inline"> · </span>영업일 기준 2~3일 안에 도착해요.{/if}
			</p>
			{#if waiting && r.deposit}
				<div class="mt-5 rounded-[18px] border border-accent/30 bg-accent/8 px-[18px] py-4 text-left lg:mt-6">
					<p class="text-[13px] font-bold text-accent">가상계좌 입금 안내</p>
					<p class="mt-1.5 text-[15px] font-bold">{r.deposit.bank} {r.deposit.account}</p>
					{#if r.deposit.holder}<p class="text-[13px] text-white/70">예금주 {r.deposit.holder}</p>{/if}
					<p class="mt-1 text-[13px] text-white/70">입금 금액 <b class="text-fg">{won(card?.amount ?? view.amount)}</b>{#if r.deposit.due} · 기한 {dueText(r.deposit)}{/if}</p>
				</div>
			{/if}
			<div class="lg:mt-8 lg:grid lg:grid-cols-2 lg:gap-3.5 lg:text-left">
				<div class="mt-6 rounded-[18px] border border-white/7 bg-white/3 px-[18px] pt-1.5 pb-2 lg:mt-0 lg:rounded-[20px] lg:px-5">
					<p class="mt-3 mb-1 text-[13px] font-bold text-fg-faint lg:mt-3.5 lg:mb-1.5">주문 내역</p>
					{#if card}
						{#each card.items as l, i (i)}
							<div class="flex items-baseline justify-between gap-4 border-t border-white/6 py-[11px] text-[14px]"><span class="text-white/75">{l.name}{#if l.option} · {l.option}{/if} × {l.qty}</span><span class="font-bold whitespace-nowrap">{won(l.amount)}</span></div>
						{/each}
						{#if card.shippingFee}
							<div class="flex items-baseline justify-between gap-4 border-t border-white/6 py-[11px] text-[14px]"><span class="text-white/75">배송비</span><span class="font-bold whitespace-nowrap">{won(card.shippingFee)}</span></div>
						{/if}
						<div class="flex items-baseline justify-between border-t border-white/10 pt-3 pb-2.5"><span class="font-bold">총 결제</span><span class="text-[18px] font-extrabold text-accent">{won(card.amount)}</span></div>
					{:else}
						<div class="flex items-baseline justify-between border-t border-white/10 pt-3 pb-2.5"><span class="font-bold">총 결제</span><span class="text-[18px] font-extrabold text-accent">{won(view.amount)}</span></div>
					{/if}
				</div>
				<div class="mt-3.5 flex items-start gap-3 rounded-[18px] border border-white/7 bg-white/3 p-4 lg:mt-0 lg:flex-col lg:gap-3.5 lg:rounded-[20px] lg:p-5">
					<p class="hidden text-[13px] font-bold text-fg-faint lg:block">배송 정보</p>
					<span class="flex gap-3 text-[13px] leading-[1.55] text-white/70 lg:text-[14px] lg:text-white/80">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0" aria-hidden="true"><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></svg>
						<span>{card?.address || '입력한 주소로 보내드려요'}</span>
					</span>
					<span class="hidden text-[13px] text-fg-faint lg:block">주문 확인·발송 안내는 이메일로 보내드려요(이메일을 남긴 경우)</span>
				</div>
			</div>
			{#if r.guest}
				<p class="mt-4 text-[13px] leading-[1.6] text-fg-faint">비회원 주문이에요 — 주문번호와 연락처로 <a href="/orders/lookup" class="underline underline-offset-2">주문 조회</a>에서 배송·환불·문의를 할 수 있어요.</p>
			{/if}
		{/if}
	</div>
	<div class="flex shrink-0 gap-2.5 px-5 pt-3 pb-7 lg:justify-center lg:px-0 lg:pt-7 lg:pb-0">
		{#if view.kind === 'ok'}
			<a href={view.r.guest ? guestOrderHref(view.r.orderCode) : '/my'} class="flex h-14 flex-1 items-center justify-center rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg lg:h-[54px] lg:flex-none lg:px-7">주문 내역</a>
			<a href="/" class="flex h-14 flex-1 items-center justify-center rounded-2xl bg-accent text-[15px] font-extrabold text-bg lg:h-[54px] lg:flex-none lg:px-7">계속 쇼핑하기</a>
		{:else if view.kind === 'fail'}
			{#if view.fail.kind === 'pending'}
				<a href="/my" class="flex h-14 flex-1 items-center justify-center rounded-2xl bg-accent text-[15px] font-extrabold text-bg lg:h-[54px] lg:flex-none lg:px-7">주문 내역</a>
			{:else}
				<a href="/cart" class="flex h-14 flex-1 items-center justify-center rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg lg:h-[54px] lg:flex-none lg:px-7">장바구니</a>
				<a href="/checkout" class="flex h-14 flex-1 items-center justify-center rounded-2xl bg-accent text-[15px] font-extrabold text-bg lg:h-[54px] lg:flex-none lg:px-7">다시 시도</a>
			{/if}
		{/if}
	</div>
</div>
