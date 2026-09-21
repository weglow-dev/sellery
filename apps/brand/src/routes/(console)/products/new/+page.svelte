<script lang="ts">
	/** 새 상품 등록 — 폼은 `../ProductForm.svelte`, 실패 시 `form`(fail 400) 값으로 다시 그린다. */
	import ProductForm from '../ProductForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>새 상품 등록 — 셀러리 파트너</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 상품 관리</a>

<div class="console-head">
	<h2>새 상품 등록</h2>
	<span class="meta">등록 후 운영팀 검수(pending)를 통과하면 인플루언서에게 노출됩니다</span>
</div>

<section class="card static">
	<ProductForm
		values={form?.values ?? data.values}
		thumbUrl={form?.thumb_url ?? null}
		imageUrls={form?.image_urls ?? []}
		categories={data.categories}
		isNew
		field={form?.field ?? null}
		message={form?.message ?? null}
		imageAccept={data.imageAccept}
		imageMaxMb={data.imageMaxMb}
		listPath={data.listPath}
	/>
</section>
