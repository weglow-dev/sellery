<script lang="ts" module>
	/**
	 * 콘솔 하단 탭 (web (partner)/console-tabs.tsx 1:1). href 는 셸이 `consolePath` 로 만든 최종 상대 경로(`/influencer/home`).
	 * 활성 판정은 레이아웃이 넘긴 `pathname`(`page.url.pathname`) 과 href 를 같은 기준(접두 포함)으로 비교한다 — usePathname 대체.
	 * `disabled` 탭(아직 없는 단계 — 브랜드 콘솔 예고용)은 링크 대신 `aria-disabled` span 으로 그리고 `title` 로 예고한다.
	 */
	export type ConsoleTabIcon = 'home' | 'box' | 'flag' | 'chart' | 'user';
	export type ConsoleTab = { href: string; label: string; icon: ConsoleTabIcon; disabled?: boolean; title?: string };
</script>

<script lang="ts">
	let { tabs, pathname = '/' }: { tabs: ConsoleTab[]; pathname?: string } = $props();
	const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
</script>

{#snippet icon(t: ConsoleTab)}
	{#if t.icon === 'home'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
	{:else if t.icon === 'box'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
	{:else if t.icon === 'flag'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4" /><path d="M5 4h13l-3 4.5 3 4.5H5" /></svg>
	{:else if t.icon === 'chart'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></svg>
	{:else}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>
	{/if}
{/snippet}

<nav class="console-tabs" aria-label="콘솔 메뉴">
	{#each tabs as t (t.href)}
		{#if t.disabled}
			<span class="console-tab" aria-disabled="true" title={t.title}>
				{@render icon(t)}
				<span>{t.label}</span>
			</span>
		{:else}
			<a href={t.href} class="console-tab" aria-current={isActive(t.href) ? 'page' : undefined} title={t.title}>
				{@render icon(t)}
				<span>{t.label}</span>
			</a>
		{/if}
	{/each}
</nav>
