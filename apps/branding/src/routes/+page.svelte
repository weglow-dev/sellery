<script lang="ts">
	import SiteHeader from '$lib/components/section/SiteHeader.svelte';
	import Hero from '$lib/components/section/Hero.svelte';
	import ZeroStats from '$lib/components/section/ZeroStats.svelte';
	import ValueGrid from '$lib/components/section/ValueGrid.svelte';
	import Steps from '$lib/components/section/Steps.svelte';
	import BrandStory from '$lib/components/section/BrandStory.svelte';
	import Growth from '$lib/components/section/Growth.svelte';
	import Categories from '$lib/components/section/Categories.svelte';
	import FinalCta from '$lib/components/section/FinalCta.svelte';
	import SiteFooter from '$lib/components/section/SiteFooter.svelte';
</script>

<svelte:head>
	<title>셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드</title>
	<meta
		name="description"
		content="재고 부담, 제조 비용, 행정 리스크 없이 나만의 다이어트·이너뷰티·멘탈/맨즈 웰니스 브랜드를 만들고 판매를 시작하세요. 제조부터 배송, CS까지 셀러리가 맡습니다."
	/>
	<meta property="og:title" content="셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드" />
	<meta
		property="og:description"
		content="팔로워가 있다면, 브랜드도 가질 수 있어요. 제조·재고·운영은 전부 셀러리가 할게요."
	/>
</svelte:head>

<SiteHeader />

<main>
	<Hero />
	<ZeroStats />
	<ValueGrid />
	<Steps />
	<BrandStory />
	<Growth />
	<Categories />
	<FinalCta />
</main>

<SiteFooter />
