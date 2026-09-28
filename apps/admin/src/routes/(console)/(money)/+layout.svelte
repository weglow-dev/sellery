<script lang="ts">
	/**
	 * "정산 · 돈" 그룹 레이아웃 — `(console)/+layout.svelte`(셸 `PartnerShell role="admin"`) 안에서 돈 화면 6개(정산 · 지급 · 주문 · 결제 · 매출·순수익 · 문의)에
	 * 공통 내비를 준다 (docs/admin-console-plan.md "정산·돈" PR-B).
	 *
	 * 2026-09-22: 셸에 하단 탭(`TABS.admin`)이 생기고 **정산 탭이 열리면서** 이 파일의 상단 바(워드마크 · "관리자 콘솔" · 홈 · 로그아웃)를
	 * 제거했다 — 셸이 같은 것을 이미 그려 두 번 나왔다. 원래 주석("셸에 탭 배열이 생기면 이 파일의 내비는 그쪽 한 줄로 옮기고 여기는
	 * `{@render children()}` 만 남긴다")대로의 조치이고, **화면 칩(`$lib/money-nav`)은 남긴다** — 하단 탭의 "정산" 하나로는
	 * settle · payouts · orders · payments · revenue · cs 여섯 화면을 오갈 수 없다(브랜드 콘솔도 탭은 영역, 세부 이동은 화면 안에서).
	 *
	 * 게이트는 각 page 의 `requireAdmin()` (결정 6).
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { activeNavHref } from '@sellery/db/console-paths';
	import { MONEY_NAV, MONEY_NAV_HREFS, moneyNavHref } from '$lib/money-nav';

	let { children }: { children: Snippet } = $props();
	/**
	 * 활성 칩 — **접두 포함 전체 경로끼리** 비교한다(셸 `ConsoleTabs` 와 같은 기준).
	 * `base` 를 빼서 맞추려 하면 안 된다 — `paths.relative` 기본값 때문에 SSR 에서 `base` 가 `.` · `..` 다.
	 */
	const active = $derived(activeNavHref(page.url.pathname, MONEY_NAV_HREFS));
</script>

<nav class="cats console-filters admin-money-nav" aria-label="정산·돈 메뉴">
	{#each MONEY_NAV as t (t.href)}
		{@const href = moneyNavHref(t.href)}
		{@const on = active === href}
		<a {href} class="catchip {on ? 'on' : ''}" aria-current={on ? 'page' : undefined} title={t.title}>{t.label}</a>
	{/each}
</nav>

<div class="admin-money">
	{@render children()}
</div>
