<script lang="ts">
	/** MYR 로고 + CREATOR 배지 — 로그인 · 가입 화면 머리. 큰 크기는 PC */
	let { large = false }: { large?: boolean } = $props();
</script>

<a href="/login" class="flex items-center gap-2.5" aria-label="MYR 크리에이터 스튜디오">
	<img src="/myr-logo.svg" alt="MYR" class="block w-auto {large ? 'h-[30px] lg:h-8' : 'h-7'}" />
	<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
</a>
