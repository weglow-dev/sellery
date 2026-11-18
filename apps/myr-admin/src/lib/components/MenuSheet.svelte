<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, isActive } from '$lib/menus';
	import { ME, server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 전체 메뉴 — 메뉴 9개 + 배지. PC 에서만 되는 화면(상품 심사 · 송장 일괄)도 목록은 보인다 */
	const nav = $derived(server.nav);
</script>

{#if app.menuOpen}
	<div class="fixed inset-0 z-40 lg:hidden">
		<button type="button" class="absolute inset-0 animate-fade-in bg-black/60" aria-label="닫기" onclick={() => (app.menuOpen = false)}></button>
		<div class="absolute inset-x-0 bottom-0 mx-auto max-w-[430px] animate-sheet rounded-t-[28px] border-t border-white/10 bg-panel px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
			<div class="flex items-center justify-between">
				<p class="text-[17px] font-extrabold">전체 메뉴</p>
				<button type="button" onclick={() => (app.menuOpen = false)} class="flex h-11 w-11 items-center justify-center rounded-[14px] text-white/70" aria-label="닫기"><Icon id="x" size={20} /></button>
			</div>
			<div class="mt-2 grid grid-cols-3 gap-2">
				{#each MENUS as m (m.key)}
					{@const on = isActive(page.url.pathname, m.href)}
					{@const b = nav[m.key]}
					<a href={m.href} onclick={() => (app.menuOpen = false)} class="relative flex h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border text-[13px] font-bold {on ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/8 bg-white/3 text-white/85'}">
						<Icon id={m.icon} size={22} />
						{m.name}
						{#if b?.n}<span class="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums text-bg {b.hot ? 'bg-danger' : 'bg-accent'}">{b.n}</span>{/if}
					</a>
				{/each}
			</div>
			<div class="mt-4 flex items-center justify-between rounded-2xl bg-white/4 px-4 py-3">
				<span class="text-[14px] font-bold">{ME.role} {ME.name}<span class="ml-2 text-[12px] font-medium text-white/55">MYR 운영팀</span></span>
				<button type="button" class="flex h-11 items-center gap-1.5 text-[13px] font-bold text-white/65"><Icon id="logout" size={16} />로그아웃</button>
			</div>
		</div>
	</div>
{/if}
