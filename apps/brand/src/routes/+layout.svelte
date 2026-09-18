<script lang="ts">
	import '../app.css';
	import { S, D_, brand, celBal, dmUnreadN, brandPending, csOpen, CEL, act, go } from '@sellery/core';
	import { AppShell } from '@sellery/ui';
	import { base } from '$app/paths';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const dmN = $derived(dmUnreadN('brand', S.actingBrand) + brandPending(S.actingBrand).n);
	const csN = $derived(csOpen(S.actingBrand).length);
	const tabs = $derived([
		{ href: '/', label: '홈' }, { href: '/dm', label: 'DM', badge: dmN }, { href: '/camps', label: '내 캠페인' }, { href: '/orders', label: '주문·발주' }, { href: '/cs', label: '고객 문의', badge: csN },
		{ href: '/sales', label: '실시간 매출' }, { href: '/settle', label: '정산' }, { href: '/products', label: '상품 관리' }, { href: '/gallery', label: '인플루언서 갤러리' }, { href: '/shop', label: '셀러리 샵' }
	]);
	const me = $derived(brand(S.actingBrand));
</script>

<AppShell {tabs}>
	{#snippet right()}
		<button class="celery-bal" onclick={() => go.screen('shop')} title="셀러리 샵">{@html CEL} {celBal(S.actingBrand)}</button>
		<button class="iconbtn" aria-label="마이페이지" title="마이페이지" onclick={() => go.screen('my')}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg></button>
	{/snippet}
	{#snippet persona()}
		<div class="persona">
			{#if S.session && S.session.role === 'brand'}
				<span title={S.session.email || ''}>{me.name}</span><button class="sm ghost" onclick={() => { act.logout(); location.href = base + '/login'; }}>로그아웃</button>
			{:else}
				접속 브랜드 <select value={S.actingBrand} onchange={(e) => act.setBrand((e.target as HTMLSelectElement).value)}>{#each D_().brands as b}<option value={b.id}>{b.name}</option>{/each}</select>
			{/if}
		</div>
	{/snippet}
	{@render children()}
</AppShell>
