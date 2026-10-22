<script lang="ts">
	import Funnel from '$lib/components/Funnel.svelte';
	import type { PageProps } from './$types';

	/** 홈 = 랜딩(가로 슬라이드) + 제조의뢰 퍼널 한 화면. 폼 액션은 lib/server/apply-action.ts. */
	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드</title>
	<meta
		name="description"
		content="재고 부담, 제조 비용, 행정 리스크 없이 나만의 다이어트·이너뷰티 웰니스 브랜드를 만들고 판매를 시작하세요. 제조부터 배송, CS까지 셀러리가 맡습니다."
	/>
	<meta property="og:title" content="셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드" />
	<meta property="og:description" content="팔로워가 있다면, 브랜드도 가질 수 있어요. 제조·재고·운영은 전부 셀러리가 할게요." />
</svelte:head>

<Funnel {form} />
