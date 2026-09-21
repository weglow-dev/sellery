<script lang="ts">
	/**
	 * 샘플 구매 결제 준비 — 프로토타입 sampleBuyModal(js/70-campaign.js) 의 금액 표 · 🥬/현금 선택 + 배송지 폼 (docs/inf-console-plan.md §5.3 · §5.5).
	 *   위: 상품 · 샘플 구매가 표 (판매가 − 내 수수료 또는 브랜드 지정가)
	 *   가운데: [🥬 사용] 토글 — 켜면 🥬 n(잔액 한도) + 현금 나머지, 끄면 현금 전액. 숫자는 서버 견적(quoteCel · quoteCash) 그대로 — 클라이언트 계산 없음.
	 *   아래: 배송지(ShippingFields · 프리필) · 안내(🥬 차감 · 취소 규정 · 환급 옵션) · [₩N 결제 진행] 또는 [🥬 n개로 받기]
	 * 평범한 POST(?/begin) — JS 없이도 제출된다. 실패는 `form`(fail 400) 으로 돌아와 입력값 유지 · 실패 필드 강조.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { ProductIcon, ShippingFields } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.product);
	const qCash = $derived(data.quoteCash);
	const qCel = $derived(data.quoteCel);
	const price = $derived(qCash.price ?? 0);
	const celWon = $derived(qCash.cel_won);
	const pct = (r: number) => (r * 100).toFixed(0);
	/** 🥬 를 쓸 수 있는가 — 견적이 있고 실제로 1개 이상 쓰인다 */
	const celAvailable = $derived(!!qCel && (qCel.cel ?? 0) > 0);
	// 프리필: 실패한 제출값 > 🥬 가능하면 기본 켬 (프로토타입 sampleBuyModal 의 🥬 우선)
	// svelte-ignore state_referenced_locally
	let useCel = $state(form?.values ? form.values.use_cel === 'on' : celAvailable);
	const split = $derived(useCel && celAvailable && qCel ? { cel: qCel.cel ?? 0, cash: qCel.cash ?? price } : { cel: 0, cash: price });
	const cashRequired = $derived(split.cash > 0);
	const shippingValue = $derived(form?.values ?? data.shipping);
</script>

<svelte:head>
	<title>샘플 구매 결제 — 셀러리 파트너</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<a href={data.productHref} class="btn ghost sm" style="margin:0 3px 12px">← 상품 상세</a>

<section class="card static console-det">
	<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={64} />
	<div class="grow">
		<div class="t">샘플 구매 <small>{p.code.toUpperCase()}</small></div>
		<div class="meta"><b>{p.name}</b> · <span class="chip brand">{p.brand}</span></div>
		<table class="stmt" style="min-width:0;width:100%;font-size:13px;margin-top:10px">
			<tbody>
				{#if qCash.buy_mode === 'fixed'}
					<tr><td>브랜드 지정 샘플가 (1회 한정)</td><td class="num"><b>₩{fmtNum(price)}</b></td></tr>
				{:else}
					<tr><td>판매가</td><td class="num">₩{fmtNum(p.sale_price)}</td></tr>
					<tr><td>− 내 수수료 {pct(p.commission_rate)}%</td><td class="num">−₩{fmtNum(p.sale_price - price)}</td></tr>
					<tr class="tot"><td>샘플 구매가</td><td class="num">₩{fmtNum(price)}</td></tr>
				{/if}
			</tbody>
		</table>
	</div>
</section>

{#if form?.message}
	<p class="notice danger" role="alert">{form.message}</p>
{/if}

<form method="post" action="?/begin">
	<div class="sec" style="margin-top:20px">결제 수단</div>
	<section class="card static">
		<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:13.5px;line-height:1.5">
			<input type="checkbox" name="use_cel" bind:checked={useCel} disabled={!celAvailable} style="margin-top:3px" />
			<span>
				<b>🥬 셀러리로 먼저 결제</b> <span style="color:var(--color-mute)">(보유 🥬 {data.balance} · 1🥬 = ₩{fmtNum(celWon)})</span>
				{#if !celAvailable}
					<br /><span class="meta">{data.balance <= 0 ? '보유 🥬 가 없어요' : `₩${fmtNum(celWon)} 미만이거나 현금 잔액이 100원 미만이라 🥬 를 쓸 수 없어요`} — 현금으로 결제합니다.</span>
				{/if}
			</span>
		</label>
		<dl class="console-kv" style="margin-top:12px">
			<dt>🥬 사용</dt>
			<dd>{split.cel > 0 ? `🥬 ${split.cel} (₩${fmtNum(split.cel * celWon)} 상당 · 잔액 ${data.balance} → ${data.balance - split.cel})` : '—'}</dd>
			<dt>현금 결제</dt>
			<dd><b>₩{fmtNum(split.cash)}</b>{split.cash > 0 ? ' · 토스페이먼츠 (카드 · 간편결제)' : ' · 없음'}</dd>
			<dt>합계</dt>
			<dd>₩{fmtNum(price)}</dd>
		</dl>
		<p class="meta" style="margin-top:10px">{data.notices.cel}</p>
	</section>

	<div class="sec" style="margin-top:20px">배송지</div>
	<section class="card static console-form">
		<p class="meta" style="margin:0 0 12px">브랜드가 이 주소로 샘플을 발송해요. 배송지는 <b>내 정보</b>에 기본값으로 저장됩니다.</p>
		<ShippingFields value={shippingValue} invalid={form?.field ?? null} idPrefix="pay" />
	</section>

	<section class="card static" style="margin-top:14px">
		<p class="meta" style="margin:0">
			{data.notices.cancel}.{#if qCash.refund}{' '}<b>이 상품은 판매 확정 시 샘플 구매액을 환급합니다.</b>{/if}
			구매 샘플은 브랜드 승인 없이 바로 발송 단계로 넘어가고, 이달 무상 한도를 쓰지 않습니다.
		</p>
		<div class="btnrow" style="justify-content:flex-end;margin-top:12px">
			<a href={data.productHref} class="btn ghost sm">취소</a>
			<button type="submit" class="pri">{cashRequired ? `₩${fmtNum(split.cash)} 결제 진행 →` : `🥬 ${split.cel}개로 받기`}</button>
		</div>
	</section>
</form>
