<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Icon from './Icon.svelte';

	/**
	 * 사람 아이콘 버튼 + 펼치는 메뉴(내 정보 · 로그아웃) — PC 상단 내비 · 모바일 홈 머리 공용(2026-11-09 대표 시안).
	 * 열리면 버튼이 주황 · 바깥을 누르거나 Esc · 화면을 옮기면 닫힌다. 로그아웃은 POST /auth/signout(form).
	 */
	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();
	afterNavigate(() => (open = false));
</script>

<svelte:window
	onpointerdown={(e) => open && root && !root.contains(e.target as Node) && (open = false)}
	onkeydown={(e) => open && e.key === 'Escape' && (open = false)}
/>

<div class="relative" bind:this={root}>
	<button
		type="button"
		aria-label="내 계정 메뉴"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open = !open)}
		class="flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors {open ? 'bg-accent/16 text-accent' : 'bg-white/5 text-fg hover:bg-white/10'}"
	>
		<Icon id="user" size={20} />
	</button>
	{#if open}
		<div role="menu" class="absolute top-[calc(100%+10px)] right-0 z-30 w-[220px] animate-up-in rounded-[18px] border border-white/10 bg-[#1b1c21] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.5)]">
			<a href="/my" role="menuitem" class="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-bold text-fg transition-colors hover:bg-white/5">
				<Icon id="user" size={18} class="text-white/80" />내 정보
			</a>
			<div class="mx-3 my-1 h-px bg-white/8" aria-hidden="true"></div>
			<form method="POST" action="/auth/signout">
				<button type="submit" role="menuitem" class="flex h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-semibold text-white/75 transition-colors hover:bg-white/5 hover:text-fg">
					<Icon id="logout" size={18} />로그아웃
				</button>
			</form>
		</div>
	{/if}
</div>
