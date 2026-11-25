<script lang="ts">
	import HeadIcons from './HeadIcons.svelte';

	/** 모바일 머리(~lg) — 시안 "MYR Admin"과 같게(2026-11-24): 어느 화면이든 로고 + ADMIN · 오른쪽 파트너팀 톡 · 내 계정.
	 *  본문과 같이 스크롤된다(<main> 안). 화면 제목은 각 화면 본문 맨 위(PageHead · Pending · 상세 머리)가 보여 준다 */
</script>

<header class="flex h-[60px] items-center px-5 lg:hidden">
	<a href="/" class="flex items-center gap-2.5" aria-label="MYR 어드민 홈">
		<img src="/myr-logo.svg" alt="MYR" class="block h-7 w-auto" />
		<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">ADMIN</span>
	</a>
	<HeadIcons />
</header>
