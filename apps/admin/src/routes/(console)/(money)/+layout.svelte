<script lang="ts">
	/**
	 * "정산 · 돈" 그룹 레이아웃 — `(console)/+layout.svelte`(다른 작업자 · site.css 만) 안에서 돈 화면 5개(정산 · 지급 · 주문 · 결제 · 문의)에 공통 머리를 준다
	 * (docs/admin-console-plan.md "정산·돈" PR-B). 상단 바(워드마크 → /admin/home · "관리자 콘솔" · 홈 · 로그아웃) + 화면 칩(`$lib/money-nav`).
	 * 셸에 탭 배열이 생기면 이 파일의 내비는 그쪽 한 줄로 옮기고 여기는 `{@render children()}` 만 남긴다. 게이트는 각 page 의 `requireAdmin()` (결정 6).
	 */
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { Wordmark } from '@sellery/ui/site';
	import { MONEY_NAV, isMoneyNavActive } from '$lib/money-nav';

	let { children }: { children: Snippet } = $props();
	const rel = $derived(page.url.pathname.slice(base.length) || '/');
	const signoutAction = `${base}/auth/signout?next=${encodeURIComponent(`${base}/login`)}`;
</script>

<header class="console-bar admin-money-bar">
	<Wordmark href={`${base}/home`} />
	<span class="console-label">관리자 콘솔</span>
	<div class="console-bar-right">
		<a href="{base}/home" class="btn ghost sm">홈</a>
		<form method="post" action={signoutAction}>
			<button type="submit" class="ghost sm" aria-label="로그아웃">로그아웃</button>
		</form>
	</div>
</header>

<nav class="cats console-filters admin-money-nav" aria-label="정산·돈 메뉴">
	{#each MONEY_NAV as t (t.href)}
		{@const on = isMoneyNavActive(rel, t.href)}
		<a href="{base}{t.href}" class="catchip {on ? 'on' : ''}" aria-current={on ? 'page' : undefined} title={t.title}>{t.label}</a>
	{/each}
</nav>

<div class="admin-money">
	{@render children()}
</div>
