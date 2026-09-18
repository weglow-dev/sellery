<script lang="ts">
	import '../app.css';
	import { S, D_, seller, celBal, dmUnreadN, sellerPending, CEL, act, go } from '@sellery/core';
	import { AppShell } from '@sellery/ui';
	import { base } from '$app/paths';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const dmN = $derived(dmUnreadN('seller', S.actingSeller) + sellerPending(S.actingSeller).n);
	const tabs = $derived([
		{ href: '/', label: '홈' }, { href: '/camps', label: '내 캠페인' }, { href: '/dm', label: 'DM', badge: dmN }, { href: '/explore', label: '상품 갤러리' },
		{ href: '/sales', label: '실시간 매출' }, { href: '/settle', label: '정산' }, { href: '/rank', label: '랭킹·등급' }, { href: '/shop', label: '셀러리 샵' }, { href: '/ref', label: '추천 프로그램' }
	]);
	const me = $derived(seller(S.actingSeller));
</script>

<AppShell {tabs}>
	{#snippet right()}
		<button class="celery-bal" onclick={() => go.screen('shop')} title="셀러리 샵">{@html CEL} {celBal(S.actingSeller)}</button>
		<button class="iconbtn" aria-label="마이페이지" title="마이페이지" onclick={() => go.screen('my')}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg></button>
	{/snippet}
	{#snippet persona()}
		<div class="persona">
			{#if S.session && S.session.role === 'seller'}
				<span title={S.session.email || ''}>{me.name} <span style="opacity:.75">{me.handle}</span></span><button class="sm ghost" onclick={() => { act.logout(); location.href = base + '/login'; }}>로그아웃</button>
			{:else}
				접속 인플루언서 <select value={S.actingSeller} onchange={(e) => act.setSeller((e.target as HTMLSelectElement).value)}>{#each D_().sellers as s}<option value={s.id}>{s.name} {s.handle}</option>{/each}</select>
			{/if}
		</div>
	{/snippet}
	{@render children()}
</AppShell>
