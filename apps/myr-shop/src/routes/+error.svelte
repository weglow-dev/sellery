<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-4 px-5 text-center">
	<p class="text-[13px] font-bold tracking-[.08em] text-accent">{page.status}</p>
	<h1 class="text-[22px] font-extrabold tracking-[-.02em]">{page.error?.message ?? '문제가 생겼어요'}</h1>
	<a href="/" class="mt-2 flex h-12 items-center rounded-[14px] bg-accent px-[22px] text-[14px] font-extrabold text-bg">홈으로</a>
</div>
