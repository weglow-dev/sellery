<script lang="ts">
	import '../app.css';
	import { S, cartN, KAKAO_ICON, act, go } from '@sellery/core';
	import { AppShell } from '@sellery/ui';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const tabs = $derived([
		{ href: '/', label: '진행 중인 판매' }, { href: '/influencers', label: '인플루언서' }, { href: '/cart', label: '장바구니', badge: cartN() },
		...(S.cust ? [{ href: '/orders', label: '내 주문' }] : []), { href: '/about', label: '셀러리 소개' }
	]);
</script>

<AppShell {tabs}>
	{#snippet right()}
		<button class="iconbtn" aria-label="내 주문" title={S.cust ? '내 주문' : '카카오 로그인'} onclick={() => (S.cust ? go.screen('orders') : act.kakaoStart(''))}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg></button>
	{/snippet}
	{#snippet persona()}
		<div class="persona">
			{#if S.cust}<span class="kv-av">{S.cust.name[0]}</span><span style="color:var(--ink)"><b>{S.cust.name}</b>님</span><button class="sm ghost" onclick={() => { act.custLogout(); go.screen('home'); }}>로그아웃</button>
			{:else}<button class="sm kakao" onclick={() => act.kakaoStart('')}>{@html KAKAO_ICON} 카카오 로그인</button>{/if}
		</div>
	{/snippet}
	{@render children()}
</AppShell>
