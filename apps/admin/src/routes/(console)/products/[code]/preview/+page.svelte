<script lang="ts">
	/**
	 * 상세페이지 미리보기 — 데모 [상세페이지](`vStore` + preview) 의 실서비스 판.
	 * 본문은 고객 판매 페이지와 같은 `StoreView` 를 preview 모드로 렌더한다.
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

<a href={data.backPath} class="btn ghost sm preview-back">← 상품 상세</a>

<h2 class="pg">
	상세페이지 미리보기
	<small>{data.product.name} · {chip.label}</small>
</h2>

<p class="notice" role="status">
	<b>구매자에게 보이는 화면입니다</b> — 구매는 되지 않습니다. 표시된 인플루언서({data.card.seller.name}
	{data.card.seller.handle})는 레이아웃 확인용 대역이고, 실제 판매 링크는 인플루언서 일정이 확정될 때 생성됩니다.
</p>

<div class="admin-preview">
	<StoreView card={data.card} preview />
</div>

<style>
	.preview-back {
		margin: 0 3px 12px;
	}
	.admin-preview {
		margin-top: 14px;
	}
</style>
