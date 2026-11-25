<script lang="ts">
	import { page } from '$app/state';
	import { isActive } from '$lib/menus';
	import { ME, server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 머리 오른쪽 아이콘 두 개 — 파트너팀 톡(메뉴가 아니라 버튼 · 답할 차례 수) · 내 계정(이름 · 로그아웃).
	 *  PC 상단 메뉴(TopNav)와 모바일 머리(MobileTop)가 같이 쓴다 — 시안 "MYR Admin PC" · "MYR Admin" */
	const nav = $derived(server.nav);
	const talkOn = $derived(isActive(page.url.pathname, '/talk'));
	let acctOpen = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (acctOpen = false)} />

<div class="ml-auto flex shrink-0 items-center gap-2 lg:gap-2.5">
	<a href="/talk" aria-label="파트너팀 톡{nav.talk?.n ? ` · 답할 차례 ${nav.talk.n}` : ''}" aria-current={talkOn ? 'page' : undefined} class="relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors hover:bg-white/10 {talkOn ? 'bg-white/12' : 'bg-white/5'}">
		<Icon id="m_talk" size={20} />
		{#if nav.talk?.n}<span class="absolute -top-[5px] -right-[5px] flex h-5 min-w-5 items-center justify-center rounded-[10px] border-2 border-bg bg-accent px-[5px] text-[11px] font-extrabold text-bg tabular-nums">{nav.talk.n}</span>{/if}
	</a>

	<div class="relative">
		<button type="button" onclick={() => (acctOpen = !acctOpen)} aria-label="내 계정" aria-haspopup="menu" aria-expanded={acctOpen} class="flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors hover:bg-white/10 {acctOpen ? 'bg-white/12' : 'bg-white/5'}"><Icon id="user" size={20} /></button>
		{#if acctOpen}
			<button type="button" class="fixed inset-0 z-[9] cursor-default" aria-label="계정 메뉴 닫기" onclick={() => (acctOpen = false)}></button>
			<div role="menu" class="animate-menu absolute top-[calc(100%+8px)] right-0 z-10 w-[200px] rounded-2xl border border-white/12 bg-panel-2 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
				<div class="px-3 pt-2.5 pb-2">
					<p class="text-[14px] font-bold">{ME.name}</p>
					<p class="mt-0.5 text-[12px] text-white/50">MYR 운영팀</p>
				</div>
				<div class="mx-2 my-1 h-px bg-white/8"></div>
				<button type="button" role="menuitem" onclick={() => { acctOpen = false; app.showToast('로그아웃은 기능 단계에서 붙어요'); }} class="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-bold text-white/70 hover:bg-white/6 hover:text-fg"><Icon id="logout" size={18} sw={2.2} />로그아웃</button>
			</div>
		{/if}
	</div>
</div>
