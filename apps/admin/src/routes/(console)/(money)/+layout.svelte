<script lang="ts">
	/**
	 * "정산 · 돈" 그룹 레이아웃 — `(console)/+layout.svelte`(셸 `PartnerShell role="admin"`) 안에서 돈 화면 5개(정산 · 지급 · 주문 · 결제 · 문의)에
	 * 공통 내비를 준다 (docs/admin-console-plan.md "정산·돈" PR-B).
	 *
	 * 2026-09-22: 셸에 하단 탭(`TABS.admin`)이 생기고 **정산 탭이 열리면서** 이 파일의 상단 바(워드마크 · "관리자 콘솔" · 홈 · 로그아웃)를
	 * 제거했다 — 셸이 같은 것을 이미 그려 두 번 나왔다. 원래 주석("셸에 탭 배열이 생기면 이 파일의 내비는 그쪽 한 줄로 옮기고 여기는
	 * `{@render children()}` 만 남긴다")대로의 조치이고, **화면 칩(`$lib/money-nav`)은 남긴다** — 하단 탭의 "정산" 하나로는
	 * settle · payouts · orders · payments · cs 다섯 화면을 오갈 수 없다(브랜드 콘솔도 탭은 영역, 세부 이동은 화면 안에서).
	 *
	 * 게이트는 각 page 의 `requireAdmin()` (결정 6).
	 */
	import type { Snippet } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { MONEY_NAV, isMoneyNavActive } from '$lib/money-nav';

	let { children }: { children: Snippet } = $props();
	const rel = $derived(page.url.pathname.slice(base.length) || '/');
</script>

<nav class="cats console-filters admin-money-nav" aria-label="정산·돈 메뉴">
	{#each MONEY_NAV as t (t.href)}
		{@const on = isMoneyNavActive(rel, t.href)}
		<a href="{base}{t.href}" class="catchip {on ? 'on' : ''}" aria-current={on ? 'page' : undefined} title={t.title}>{t.label}</a>
	{/each}
</nav>

<div class="admin-money">
	{@render children()}
</div>
