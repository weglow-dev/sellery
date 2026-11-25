<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, TOP_NAV, isActive } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 전체 메뉴 — 시안 "MYR Admin"과 같게(2026-11-24): 화면 전체를 덮는 목록(하단 탭은 그 위에 그대로 · "전체" 칸이 주황).
	 *  줄 = 아이콘 · 이름 · 처리할 건수 배지(주황) · ›. 순서 · 이름은 PC 상단 메뉴와 같다(TOP_NAV) · 파트너팀 톡은 머리 아이콘이라 빠진다.
	 *  PC 에서만 되는 화면(상품 심사 · 송장 일괄)도 목록은 보인다 */
	const nav = $derived(server.nav);
	const items = $derived(TOP_NAV.map((t) => ({ ...t, href: MENUS.find((m) => m.key === t.key)!.href })));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.menuOpen = false)} />

{#if app.menuOpen}
	<div class="no-bar absolute inset-0 z-[25] animate-fade-in overflow-y-auto bg-bg px-5 pb-[120px] lg:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
		<div class="flex h-[60px] items-center justify-between">
			<p class="text-[22px] font-extrabold tracking-[-0.02em]">전체 메뉴</p>
			<button type="button" onclick={() => (app.menuOpen = false)} aria-label="메뉴 닫기" class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5"><Icon id="x" size={18} sw={2.2} /></button>
		</div>
		<div class="mt-2 overflow-hidden rounded-[20px] border border-white/8 bg-white/3">
			<div class="-mt-px">
				{#each items as m (m.key)}
					{@const on = isActive(page.url.pathname, m.href)}
					{@const b = nav[m.key]}
					<a href={m.href} onclick={() => (app.menuOpen = false)} aria-current={on ? 'page' : undefined} class="flex h-[58px] items-center gap-3 border-t border-white/6 pr-4 pl-[18px] text-[16px] font-bold {on ? 'bg-white/7' : ''}">
						<span class="flex shrink-0 text-white/60"><Icon id={m.icon} size={20} sw={1.8} /></span>
						<span class="flex-1">{m.label}</span>
						{#if b?.n}<span class="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-accent px-1.5 text-[11.5px] font-extrabold text-bg tabular-nums">{b.n}</span>{/if}
						<span class="shrink-0 text-white/40" aria-hidden="true"><Icon id="chev" size={18} sw={2.2} /></span>
					</a>
				{/each}
			</div>
		</div>
	</div>
{/if}
