<script lang="ts">
	import Funnel from '$lib/components/Funnel.svelte';
	import type { PageProps } from './$types';
	import { BRAND_NAME, OEM_PUBLIC_URL, OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH } from '$lib/site';

	/** 홈 = 랜딩(가로 슬라이드) + 제조의뢰 퍼널 한 화면. 폼 액션은 lib/server/apply-action.ts. */
	let { form }: PageProps = $props();

	const TITLE = `${BRAND_NAME} — 나만 팔 수 있는 제품`;
	const OG_DESCRIPTION = `팔로워가 있다면, 나만의 제품을 만들 수 있어요. 제조·재고·운영은 전부 ${BRAND_NAME}가 할게요.`;
</script>

<!-- canonical · og:url 은 공개 주소(sellery.life/influencer/oem) — 이 앱의 실제 호스트 makeyourrecipe.vercel.app 이 중복 주소로 색인되지 않게.
     og:image 가 있어야 카카오톡·DM·페이스북 링크 미리보기에 이미지가 뜬다(static/og.png · 1200×630). -->
<svelte:head>
	<title>{TITLE}</title>
	<meta
		name="description"
		content="재고 부담, 제조 비용, 행정 리스크 없이 성분부터 맛까지 내가 고른 나만의 다이어트·이너뷰티 제품을 만들고, 내 채널에서만 판매를 시작하세요. 제조부터 배송, CS까지 {BRAND_NAME}가 맡습니다."
	/>
	<link rel="canonical" href={OEM_PUBLIC_URL} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={BRAND_NAME} />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:url" content={OEM_PUBLIC_URL} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={OG_DESCRIPTION} />
	<meta property="og:image" content={OG_IMAGE_URL} />
	<meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={OG_DESCRIPTION} />
	<meta name="twitter:image" content={OG_IMAGE_URL} />
</svelte:head>

<Funnel {form} />
