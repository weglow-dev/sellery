<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/seo';
</script>

<!-- 오류 화면은 색인하지 않는다(404 상태로도 빠지지만, 5xx 를 잠깐 본 크롤러가 이 화면을 저장하지 않게) -->
<svelte:head>
	<title>{pageTitle(page.status === 404 ? '찾을 수 없는 페이지' : '문제가 생겼어요')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-4 px-5 text-center">
	<p class="text-[13px] font-bold tracking-[.08em] text-accent">{page.status}</p>
	<h1 class="text-[22px] font-extrabold tracking-[-.02em]">{page.error?.message ?? '문제가 생겼어요'}</h1>
	<a href="/" class="mt-2 flex h-12 items-center rounded-[14px] bg-accent px-[22px] text-[14px] font-extrabold text-bg">홈으로</a>
</div>
