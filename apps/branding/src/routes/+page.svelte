<script lang="ts">
	import SiteHeader from '$lib/sections/SiteHeader.svelte';
	import Hero from '$lib/sections/Hero.svelte';
	import ZeroStats from '$lib/sections/ZeroStats.svelte';
	import ValueGrid from '$lib/sections/ValueGrid.svelte';
	import Steps from '$lib/sections/Steps.svelte';
	import BrandStory from '$lib/sections/BrandStory.svelte';
	import Growth from '$lib/sections/Growth.svelte';
	import Categories from '$lib/sections/Categories.svelte';
	import FinalCta from '$lib/sections/FinalCta.svelte';
	import SiteFooter from '$lib/sections/SiteFooter.svelte';
	import CtaToast from '$lib/sections/CtaToast.svelte';
</script>

<svelte:head>
	<title>셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드</title>
	<meta
		name="description"
		content="재고 부담, 제조 비용, 행정 리스크 없이 나만의 다이어트·이너뷰티·더마 브랜드를 만들고 판매를 시작하세요. 제조부터 배송, CS까지 셀러리가 맡습니다."
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
<CtaToast />
