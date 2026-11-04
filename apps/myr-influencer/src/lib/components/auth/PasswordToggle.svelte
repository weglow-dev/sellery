<script lang="ts">
	/** 비밀번호 보기/숨기기 — 입력 칸 오른쪽 안 44px 버튼(시안 eye 아이콘) */
	let { shown = $bindable(false) }: { shown?: boolean } = $props();
</script>

<button
	type="button"
	onclick={() => (shown = !shown)}
	aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
	aria-pressed={shown}
	class="absolute top-[5px] right-[5px] flex h-11 w-11 items-center justify-center rounded-xl text-white/50 transition-colors hover:text-fg lg:top-1.5 lg:right-1.5"
>
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if shown}
			<path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.6 7 10 7c1.5 0 2.9-.3 4.1-.8" />
		{:else}
			<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
		{/if}
	</svg>
</button>
