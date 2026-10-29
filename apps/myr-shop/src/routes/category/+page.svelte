<script lang="ts">
	import { page } from '$app/state';
	import { CATS, PRODUCTS, catName, creatorOf } from '$lib/data';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import ProductRow from '$lib/components/ProductRow.svelte';

	/** 카테고리 — `?cat=<id>` 탭 필터 · `?creator=<id>` 크리에이터별 보기(제목이 크리에이터 이름). 상태는 URL 에만 둔다 */
	const cat = $derived(CATS.some((c) => c.id === page.url.searchParams.get('cat')) ? (page.url.searchParams.get('cat') as string) : 'all');
	const creatorId = $derived(page.url.searchParams.get('creator'));
	const creator = $derived(creatorId ? creatorOf(creatorId) : null);
	const list = $derived(PRODUCTS.filter((p) => (cat === 'all' || p.cat === cat) && (!creatorId || p.creator === creatorId)));
	const tabHref = (id: string) => `/category?cat=${id}${creatorId ? `&creator=${creatorId}` : ''}`;
</script>

<div class="flex min-h-dvh animate-slide-in flex-col">
	<BackHeader title={creator ? creator.name : catName(cat)} home>
		{#snippet right()}<span class="text-[13px] text-fg-faint">{list.length}개</span>{/snippet}
	</BackHeader>

	<div class="no-bar flex shrink-0 gap-2 overflow-x-auto px-5 pt-1.5 pb-3.5" role="tablist" aria-label="카테고리">
		{#each CATS as c (c.id)}
			{@const on = c.id === cat}
			<a
				href={tabHref(c.id)}
				role="tab"
				aria-selected={on}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				class="shrink-0 rounded-full border px-3.5 py-[9px] text-[13px] font-bold transition-all {on ? 'border-accent bg-accent text-bg' : 'border-white/10 text-white/80'}"
			>
				{c.name}
			</a>
		{/each}
	</div>

	<div class="flex flex-col gap-2.5 px-5 pb-[110px]">
		{#each list as p (p.id)}
			<ProductRow {p} />
		{/each}
		{#if list.length === 0}
			<div class="py-[60px] text-center text-[14px] text-fg-faint">아직 이 카테고리엔 제품이 없어요.<br />곧 새로운 레시피가 올라와요.</div>
		{/if}
	</div>
</div>
