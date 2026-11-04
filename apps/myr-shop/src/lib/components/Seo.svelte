<script lang="ts">
	import { page } from '$app/state';
	import { OG_IMAGE, SITE_NAME, absUrl, jsonLdText, pageTitle, siteOrigin } from '$lib/seo';

	/** 검색·공유용 머리 태그 한 벌 — 제목 · 설명 · canonical · Open Graph · 트위터 카드 · (선택) JSON-LD.
	 *  사이트 오리진은 레이아웃 데이터 `site`(PUBLIC_SITE_URL · +layout.server.ts). 규칙은 전부 `lib/seo.ts`(순수 · 테스트).
	 *  색인하지 않는 화면(장바구니 · 결제 · 주문 · 마이 · 로그인 · 문의)은 이 컴포넌트를 쓰지 않는다 — hooks 가 X-Robots-Tag 로 막는다. */
	type Props = {
		/** 페이지 제목(사이트 이름 없이). 비우면 사이트 기본 제목 */
		title?: string | null;
		description: string;
		/** 정식 경로(쿼리 포함 가능) — canonical · og:url */
		path: string;
		/** 미리보기 이미지(경로 또는 절대 URL). 비우면 static/og.png */
		image?: string | null;
		type?: 'website' | 'product';
		jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
		/** 내용이 없는 목록처럼 공개 주소지만 색인하지 않을 때(링크는 따라가게 follow) */
		noindex?: boolean;
	};
	let { title = null, description, path, image = null, type = 'website', jsonLd = null, noindex = false }: Props = $props();

	const origin = $derived(siteOrigin(page.data.site));
	const fullTitle = $derived(pageTitle(title));
	const url = $derived(absUrl(origin, path));
	const img = $derived(absUrl(origin, image ?? OG_IMAGE.path));
	const isDefaultImage = $derived(!image);
	// `<script>` 를 마크업에 직접 쓰면 Svelte 가 컴포넌트 스크립트로 읽으므로 문자열로 넣는다(내용은 jsonLdText 가 `<` 이스케이프)
	const ld = $derived(jsonLd ? `<script type="application/ld+json">${jsonLdText(jsonLd)}</` + `script>` : '');
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	{#if noindex}<meta name="robots" content="noindex, follow" />{/if}
	<link rel="canonical" href={url} />
	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={img} />
	{#if isDefaultImage}
		<meta property="og:image:width" content={String(OG_IMAGE.width)} />
		<meta property="og:image:height" content={String(OG_IMAGE.height)} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={img} />
	{#if ld}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- 서버가 만든 JSON 만 · `<` 이스케이프 -->
		{@html ld}
	{/if}
</svelte:head>
