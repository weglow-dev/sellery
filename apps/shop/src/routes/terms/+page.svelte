<script lang="ts">
	/**
	 * /terms — 이용약관 (web terms/page.tsx). 본문은 @sellery/db/legal/terms(데이터), 렌더는 @sellery/ui/site LegalDoc.
	 * 세션·DB 를 읽지 않지만 레이아웃 persona(세션)가 같이 렌더되므로 prerender 하지 않는다 — web 도 layout 의 cookies() 때문에 실제로는 동적이다. 색인 허용 (robots.txt allow).
	 */
	import { TERMS } from '@sellery/db/legal/terms';
	import { LegalDoc } from '@sellery/ui/site';
	const DESCRIPTION = '셀러리 서비스 이용약관 — 통신판매중개 플랫폼 셀러리의 이용 조건과 주문·결제·청약철회 규정.';
</script>

<svelte:head>
	<title>이용약관 — 셀러리</title>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:title" content="이용약관 — 셀러리" />
	<meta property="og:description" content={DESCRIPTION} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="이용약관 — 셀러리" />
	<meta name="twitter:description" content={DESCRIPTION} />
</svelte:head>

<LegalDoc doc={TERMS} />
