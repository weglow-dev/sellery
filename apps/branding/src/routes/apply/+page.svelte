<script lang="ts">
	import Funnel from '$lib/components/Funnel.svelte';
	import type { PageProps } from './$types';

	/** 랜딩을 건너뛰고 첫 질문(카테고리)부터 시작하는 바로 가기 — 외부 링크·제안서용. 화면과 액션은 홈과 같다. */
	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>제조의뢰 — 셀러리 브랜딩</title>
	<meta name="description" content="웰니스 브랜드 제조의뢰 — 카테고리, 제형, 패키지, 맛을 정하고 연락처를 남기면 전담 매니저가 연락드려요." />
	<meta name="robots" content="noindex" />
</svelte:head>

<Funnel {form} startStep="category" />
