<script lang="ts">
	/**
	 * 상세페이지 미리보기 — 데모의 [상세페이지] 화면(`vStore` + `preview` 플래그)의 실서비스 판.
	 * 본문은 고객 판매 페이지와 **같은 `StoreView`** 를 `preview` 모드로 렌더한다 — 검수하는 사람이 고객 화면을 그대로 본다.
	 * 상단 띠에 미리보기임을 명시한다: 구매 불가 · 표시된 인플루언서는 레이아웃 확인용 대역 · 실제 판매 링크는 일정 확정 후 생성.
	 */
	import { StoreView } from '@sellery/ui/site';
	import { productStatusChip } from '@sellery/db/admin/product-rules';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const chip = $derived(productStatusChip(data.product.status));
</script>

<svelte:head>
	<title>{data.product.name} 미리보기 — 셀러리 관리자</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="console-head">
	<a href={data.backPath} class="btn ghost sm">← 상품 상세</a>
	<h2>상세페이지 미리보기</h2>
	<span class="meta">{data.product.name} · {chip.label}</span>
</div>

<p class="notice" role="status">
	<b>구매자에게 보이는 화면입니다</b> — 구매는 되지 않습니다. 표시된 인플루언서({data.card.seller.name} {data.card.seller.handle})는
	레이아웃 확인용 대역이고, 실제 판매 링크는 인플루언서 일정이 확정될 때 생성됩니다.
</p>

<div class="admin-preview">
	<StoreView card={data.card} preview />
</div>

<style>
	/* 고객 화면과 같은 CSS 를 쓰지만 콘솔 본문 폭 안에 들어가야 한다 */
	.admin-preview {
		margin-top: 14px;
	}
</style>
