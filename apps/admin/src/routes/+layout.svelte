<script lang="ts">
	import '../app.css';
	import { S, counts, act } from '@sellery/core';
	import { AppShell } from '@sellery/ui';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const n = $derived(counts().admin);
	const tabs = $derived([
		{ href: '/', label: '대시보드', badge: n }, { href: '/products', label: '상품' }, { href: '/influencers', label: '인플루언서' }, { href: '/brands', label: '브랜드' },
		{ href: '/orders', label: '주문·CS' }, { href: '/match', label: '매칭·자동 제안' }, { href: '/revenue', label: '매출·순수익' }, { href: '/settle', label: '정산 실행' }
	]);
</script>

<AppShell {tabs}>
	{#snippet persona()}
		<div class="persona"><span class="chip">셀러리 운영팀</span>{#if S.session}<button class="sm ghost" onclick={() => { act.logout(); location.reload(); }}>로그아웃</button>{/if}</div>
	{/snippet}
	{@render children()}
</AppShell>
