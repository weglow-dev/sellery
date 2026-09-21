<script lang="ts">
	/** 판매 링크 페이지 — 본문은 @sellery/ui/site StoreView(8 블록), 메타는 +page.server.ts 의 meta (web generateMetadata 와 같은 값) */
	import { StoreView } from '@sellery/ui/site';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const m = $derived(data.meta);
</script>

<svelte:head>
	<title>{m.title} — 셀러리</title>
	<meta name="description" content={m.description} />
	{#if m.noindex}<meta name="robots" content="noindex, follow" />{/if}
	<link rel="canonical" href={m.canonical} />
	<meta property="og:title" content="{m.title} — 셀러리" />
	<meta property="og:description" content={m.description} />
	<meta property="og:url" content={m.canonical} />
	{#if m.ogImage}<meta property="og:image" content={m.ogImage} />{/if}
	<meta name="twitter:card" content={m.ogImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content="{m.title} — 셀러리" />
	<meta name="twitter:description" content={m.description} />
	{#if m.ogImage}<meta name="twitter:image" content={m.ogImage} />{/if}
</svelte:head>

<StoreView card={data.card} others={data.others} signedIn={data.signedIn} />
