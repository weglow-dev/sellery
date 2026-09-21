<script lang="ts">
	/**
	 * /privacy — 개인정보처리방침 (web privacy/page.tsx). 본문은 @sellery/db/legal/privacy(데이터), 렌더는 @sellery/ui/site LegalDoc.
	 * 체크아웃의 제3자 제공 고지가 `/privacy#third-party` 로 링크한다 (섹션 id 계약 — @sellery/db legal.ts). 색인 허용 (robots.txt allow).
	 */
	import { PRIVACY } from '@sellery/db/legal/privacy';
	import { LegalDoc } from '@sellery/ui/site';
	const DESCRIPTION = '셀러리 개인정보처리방침 — 수집 항목과 이용 목적, 보유 기간, 제3자 제공·처리위탁, 이용자의 권리.';
</script>

<svelte:head>
	<title>개인정보처리방침 — 셀러리</title>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:title" content="개인정보처리방침 — 셀러리" />
	<meta property="og:description" content={DESCRIPTION} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="개인정보처리방침 — 셀러리" />
	<meta name="twitter:description" content={DESCRIPTION} />
</svelte:head>

<LegalDoc doc={PRIVACY} />
