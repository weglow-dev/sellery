<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-full flex-col items-center justify-center gap-3 px-5 py-20 text-center">
	<p class="text-[44px] font-extrabold tracking-[-0.04em] text-accent tabular-nums">{page.status}</p>
	<p class="text-[16px] font-bold">{page.status === 404 ? '없는 화면이에요' : '화면을 불러오지 못했어요'}</p>
	<a href="/" class="mt-2 inline-flex h-11 items-center rounded-xl bg-white/6 px-4 text-[14px] font-bold">홈으로</a>
</div>
