<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
	<p class="text-[40px] font-extrabold text-accent">{page.status}</p>
	<p class="text-[15px] text-white/65">{page.status === 404 ? '찾는 화면이 없어요' : '잠시 후 다시 시도해주세요'}</p>
	<a href="/" class="mt-2 rounded-2xl bg-accent px-6 py-3.5 text-[15px] font-extrabold text-bg">홈으로</a>
</div>
