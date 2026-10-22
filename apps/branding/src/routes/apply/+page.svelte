<script lang="ts">
	import Funnel from '$lib/components/Funnel.svelte';
	import type { PageProps } from './$types';
	import { BRAND_NAME, OEM_PUBLIC_URL, OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH } from '$lib/site';

	/** 랜딩을 건너뛰고 첫 질문(카테고리)부터 시작하는 바로 가기 — 외부 링크·제안서용. 화면과 액션은 홈과 같다. */
	let { form }: PageProps = $props();

	const TITLE = `제조의뢰 — ${BRAND_NAME}`;
	const DESCRIPTION = '웰니스 브랜드 제조의뢰 — 카테고리, 제형, 패키지, 맛을 정하고 연락처를 남기면 전담 매니저가 연락드려요.';
	const CANONICAL = `${OEM_PUBLIC_URL}/apply`;
</script>

<!-- 검색 색인은 막되(noindex) 제안서·DM 으로 공유되는 링크라 미리보기(og:*)는 홈과 같은 이미지로 -->
<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<meta name="robots" content="noindex" />
	<link rel="canonical" href={CANONICAL} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={BRAND_NAME} />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:url" content={CANONICAL} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:image" content={OG_IMAGE_URL} />
	<meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESCRIPTION} />
	<meta name="twitter:image" content={OG_IMAGE_URL} />
</svelte:head>

<Funnel {form} startStep="category" />
