<script lang="ts">
	/**
	 * 성공 URL 랜딩 — POST /api/payments/confirm 을 정확히 1회 호출하고 주문 완료 / 실패 뷰를 렌더 (web checkout/success/success-client.tsx 1:1).
	 *   · 셋 중 하나라도 없거나 amount 가 ^\d+$ 가 아니면 즉시 실패 뷰 (parseSuccessParams — Number() 파싱 금지)
	 *   · `confirmed` 가드로 1회 (서버는 app_claim_checkout 으로 멱등 — 새로고침은 already:true, 주문 중복 없음)
	 *   · 409 CONFIRMING → 1.5초 후 1회 재시도, 그래도 409 면 "확인 중" 안내 + 내 주문 링크 (app-plan §7.2)
	 *   · 401 → 세션 만료: 로그인 후 같은 URL 로 복귀 (confirm 이 그때 실행된다)
	 *   · 실패 code → 문구 매핑은 failText (app-plan §6.3 표 전부)
	 * 성공 뷰 = 프로토타입 orderDoneModal (js/80-actions.js L730-737, L736 데모 문장 제외). 주문번호는 orders.code 대문자.
	 * 복귀 링크는 체크아웃이 sessionStorage[RETURN_KEY] 에 둔 { store, retry } — 다음 틱에 읽는다. 저장 불가면 홈.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { DEFAULT_SETTINGS, won } from '@sellery/db/campaign';
	import { COMPANY } from '@sellery/db/company';
	import { failText, parseCheckoutReturn, parseSuccessParams, RETURN_KEY, type CheckoutReturn, type FailText } from '@sellery/payments/checkout-rules';
	import { ProductIcon } from '@sellery/ui/site';

	/** /api/payments/confirm 성공 응답의 card (buildSuccessCard) — 조회 실패 시 null */
	type ConfirmCard = {
		product: string;
		emoji: string | null;
		thumbUrl: string | null;
		option: string;
		qty: number;
		amount: number;
		seller: string;
		handle: string;
		brand: string;
		code: string;
		storeUrl: string;
		buyerName: string;
	};
	type ConfirmOk = { ok: true; orderCode: string; already?: boolean; card: ConfirmCard | null };
	type ConfirmFail = { ok: false; code: string; message?: string };
	type State =
		| { kind: 'loading' }
		| { kind: 'ok'; orderCode: string; already: boolean; card: ConfirmCard | null; amount: number }
		| { kind: 'fail'; fail: FailText; code: string };

	const RETRY_DELAY_MS = 1500;
	const external = /^https?:\/\//.test(COMPANY.csUrl);

	// 렌더 시점에 결정 — 셋 중 하나라도 없거나 amount 형식이 어긋나면 confirm 호출 없이 즉시 실패 뷰
	const sp = page.url.searchParams;
	const parsed = parseSuccessParams(sp.get('paymentKey'), sp.get('orderId'), sp.get('amount'));
	let view = $state<State>(parsed ? { kind: 'loading' } : { kind: 'fail', code: 'BAD_REQUEST', fail: failText('BAD_REQUEST') });
	let ret = $state<CheckoutReturn | null>(null);
	let confirmed = false;

	async function postConfirm(body: { paymentKey: string; orderId: string; amount: number }): Promise<{ status: number; data: ConfirmOk | ConfirmFail | null }> {
		const res = await fetch('/api/payments/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			cache: 'no-store'
		});
		const data = (await res.json().catch(() => null)) as ConfirmOk | ConfirmFail | null;
		return { status: res.status, data };
	}

	function readReturn(): CheckoutReturn | null {
		try {
			return parseCheckoutReturn(window.sessionStorage.getItem(RETURN_KEY));
		} catch {
			return null; // 저장소 접근 불가 — 홈으로 대체
		}
	}

	onMount(() => {
		// sessionStorage 는 외부 시스템 — 다음 틱에 읽는다
		const t = window.setTimeout(() => (ret = readReturn()), 0);

		if (parsed && !confirmed) {
			confirmed = true; // confirm 은 정확히 1회
			const body = parsed;
			(async () => {
				let r = await postConfirm(body);
				if (r.status === 409) {
					// 다른 요청이 진행 중(신선한 CONFIRMING) — 1.5초 뒤 1회 재시도
					await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
					r = await postConfirm(body);
				}
				if (r.status === 401) {
					const here = window.location.pathname + window.location.search;
					window.location.replace(`/login?next=${encodeURIComponent(here)}`);
					return;
				}
				const d = r.data;
				if (r.status >= 200 && r.status < 300 && d && d.ok === true) {
					view = { kind: 'ok', orderCode: d.orderCode, already: d.already === true, card: d.card ?? null, amount: body.amount };
					return;
				}
				const code = d && d.ok === false && d.code ? d.code : r.status === 409 ? 'CONFIRMING' : 'UNKNOWN';
				const message = d && d.ok === false ? d.message : undefined;
				view = { kind: 'fail', code, fail: failText(code, message) };
			})().catch((e: unknown) => {
				console.error('[checkout/success] confirm failed', e);
				// 네트워크 오류 — 서버가 처리했을 수 있다: FAILED 로 단정하지 않고 "확인 중" 으로 안내
				view = { kind: 'fail', code: 'CONFIRMING', fail: failText('CONFIRMING') };
			});
		}
		return () => window.clearTimeout(t);
	});
</script>

<svelte:head>
	<title>{view.kind === 'ok' ? '주문 완료' : view.kind === 'fail' ? '결제 확인' : '결제 확인 중'} — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if view.kind === 'loading'}
	<div class="store">
		<div class="card static">
			<div class="empty" role="status" aria-live="polite"><span class="pulse" aria-hidden="true" style="color:var(--color-accent)"></span>결제를 확인하고 있어요…</div>
		</div>
	</div>
{:else if view.kind === 'fail'}
	{@const pending = view.fail.kind === 'pending'}
	<div class="store">
		<div class="card static">
			<h3>{pending ? '결제 확인 중' : '주문을 완료하지 못했어요'}</h3>
			<div class={pending ? 'notice' : 'notice danger'} role="alert" style="margin:0 0 10px">{view.fail.text}</div>
			{#if view.fail.money}<div class="meta" style="margin-bottom:6px">결제 상태: {view.fail.money}</div>{/if}
			<div class="meta" style="font-family:var(--font-mono);font-size:11px">코드 {view.code}</div>
			<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
				<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
				{#if pending}
					<a href="/account/orders" class="btn pri">내 주문</a>
				{:else}
					{#if ret?.retry && view.code !== 'NOT_LIVE' && view.code !== 'SOLD_OUT'}
						<a href={ret.retry} class="btn">다시 시도</a>
					{/if}
					<a href={ret?.store ?? '/'} class="btn pri">판매 페이지로</a>
				{/if}
			</div>
		</div>
	</div>
{:else}
	{@const card = view.card}
	{@const storeHref = card?.storeUrl ?? ret?.store ?? '/'}
	<div class="store">
		<div class="card static">
			<h3>주문 완료 ✓</h3>
			<div class="notice" style="margin:0 0 12px">
				결제 금액은 <b>셀러리</b>가 안전하게 보관하고, 판매 종료 후 교환/환불 기간({DEFAULT_SETTINGS.clear_days}일)이 지나면 브랜드·인플루언서에게 정산됩니다.
			</div>
			<table class="stmt" style="min-width:0;font-size:13px">
				<tbody>
					<tr>
						<td style="white-space:nowrap;font-family:var(--font-mono);font-weight:700">{view.orderCode.toUpperCase()}</td>
						<td class="num" style="white-space:normal">
							{#if card}
								<span style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
									<ProductIcon thumbUrl={card.thumbUrl} emoji={card.emoji ?? '📦'} size={28} />
									<span>{card.product} · {card.option} × {card.qty} · <b>{won(card.amount)}</b></span>
								</span>
								<div style="font-size:11.5px;color:var(--color-mute);font-weight:400">{card.seller} {card.handle} · {card.brand} 직배송</div>
							{:else}
								<b>{won(view.amount)}</b>
							{/if}
						</td>
					</tr>
				</tbody>
			</table>
			<p style="font-size:12px;color:var(--color-mute);margin-top:10px">
				{#if card?.buyerName}<b>{card.buyerName}</b>님의 <b>내 주문</b>에서 배송·환불을 관리할 수 있어요.{:else}<b>내 주문</b>에서 배송·환불을 관리할 수 있어요.{/if}
				운송장은 카카오 알림톡으로 안내됩니다.
			</p>
			<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
				<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
				<a href="/account/orders" class="btn">내 주문</a>
				<a href={storeHref} class="btn pri">확인</a>
			</div>
		</div>
	</div>
{/if}
