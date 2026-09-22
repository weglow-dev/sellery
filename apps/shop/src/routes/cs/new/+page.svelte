<script lang="ts">
	/**
	 * 판매자에게 문의 — 프로토타입 csModal(js/40-brand.js · 60-customer 문의 모달) 의 페이지 판. 머리(상품 · 브랜드 · 인플루언서) · .notice 원문("이 문의는 {brand}(공급 브랜드)에 바로 전달됩니다 …")
	 * · 폼(이름 · 유형 · 주문번호(선택) · 내용) → `?/open`. 실패한 제출은 `form`(fail 400/429)으로 값 유지 · 필드 강조. 비회원도 접수 가능 — 답변은 접수 뒤 열리는 문의 화면(쿠키로 90일)에서.
	 */
	import { ProductIcon } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const v = (k: string, d = '') => form?.values?.[k] ?? d;
	const inv = (k: string) => (form?.field === k ? 'invalid' : '');
</script>

<svelte:head>
	<title>판매자에게 문의 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="cs-page">
	<a href={data.campaign.storeUrl} class="btn ghost sm" style="margin:0 3px 12px">← 판매 페이지</a>
	<h2 class="pg">판매자에게 문의 <small>배송 · 교환 · 반품 · 상품 문의는 공급 브랜드가 직접 답해요</small></h2>

	<div class="card static">
		<div class="cs-head">
			<ProductIcon thumbUrl={data.product.thumb_url} emoji={data.product.emoji} size={44} />
			<div class="grow">
				<div class="nm">{data.product.name}</div>
				<p class="meta">{data.brand.name} · {data.seller.name}님의 판매 · <span style="font-family:var(--font-mono)">{data.campaign.code.toUpperCase()}</span></p>
			</div>
		</div>
		<div class="notice" style="margin:14px 0 0">이 문의는 <b>{data.brand.name}</b>(공급 브랜드)에 바로 전달됩니다. 배송·교환·반품은 브랜드가 직접 처리하고, 결제·정산 문제는 셀러리가 함께 확인합니다.</div>
	</div>

	{#if !data.canOpen}
		<div class="card static" style="margin-top:14px">
			<p class="notice" style="margin:0">아직 판매가 시작되지 않은 페이지예요 — 판매 중이거나 판매가 끝난 캠페인에만 문의를 남길 수 있어요.</p>
		</div>
	{:else}
		<form method="post" action={`?campaign=${encodeURIComponent(data.campaign.code)}&/open`} class="card static cs-form console-form" style="margin-top:14px">
			<input type="hidden" name="campaign" value={data.campaign.code} />
			{#if form?.message && !form.field}<p class="notice danger" role="alert" style="margin:0 0 12px">{form.message}</p>{/if}
			<div class="fld {inv('buyer_name')}">
				<label for="cs-name">이름 <span class="font-normal">(선택 · {data.nameMax}자)</span></label>
				<input id="cs-name" name="buyer_name" value={v('buyer_name', data.prefill.buyer_name)} maxlength={data.nameMax} placeholder="답변에 쓸 이름" autocomplete="name" />
				{#if form?.field === 'buyer_name'}<div class="hint" style="color:var(--color-danger)">{form.message}</div>{/if}
			</div>
			<div class="fld {inv('type')}">
				<label for="cs-type">문의 유형</label>
				<select id="cs-type" name="type" required>
					<option value="" disabled selected={!v('type')}>선택</option>
					{#each data.types as t (t)}<option value={t} selected={v('type') === t}>{t}</option>{/each}
				</select>
				{#if form?.field === 'type'}<div class="hint" style="color:var(--color-danger)">{form.message}</div>{/if}
			</div>
			<div class="fld {inv('order_code')}">
				<label for="cs-order">주문번호 <span class="font-normal">(선택 · 예: O2001)</span></label>
				<input id="cs-order" name="order_code" value={v('order_code', data.prefill.order_code)} maxlength="32" placeholder="주문 확인 문자 · 내 주문에서 확인" autocomplete="off" style="font-family:var(--font-mono);text-transform:uppercase" />
				<div class="hint">주문번호를 함께 남기면 브랜드가 바로 확인할 수 있어요{#if data.ordersHref}{' '}— <a href={data.ordersHref} style="text-decoration:underline">내 주문</a>{/if}</div>
				{#if form?.field === 'order_code'}<div class="hint" style="color:var(--color-danger)">{form.message}</div>{/if}
			</div>
			<div class="fld {inv('body')}">
				<label for="cs-body">문의 내용 <span class="font-normal">({data.bodyMax}자까지)</span></label>
				<textarea id="cs-body" name="body" rows="6" maxlength={data.bodyMax} required placeholder="예: 배송이 언제 출발하나요? / 옵션을 바꾸고 싶어요">{v('body')}</textarea>
				<div class="hint">연락처는 남기지 않아도 돼요 — 답변은 이 화면에서 확인합니다{#if !data.signedIn}{' '}(비회원은 접수 뒤 열리는 문의 화면 주소를 저장해두세요 · 이 기기에서 90일간 열려요){/if}.</div>
				{#if form?.field === 'body'}<div class="hint" style="color:var(--color-danger)">{form.message}</div>{/if}
			</div>
			<div class="btnrow" style="justify-content:flex-end">
				<a href={data.campaign.storeUrl} class="btn ghost">취소</a>
				<button type="submit" class="pri">문의 보내기</button>
			</div>
		</form>
	{/if}
</div>
