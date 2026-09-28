<script lang="ts" module>
	/**
	 * 콘솔 하단 탭 (web (partner)/console-tabs.tsx 1:1). href 는 셸이 `consolePath` 로 만든 최종 상대 경로(`/influencer/home`).
	 * 활성 판정은 레이아웃이 넘긴 `pathname`(`page.url.pathname`) 과 href 를 **접두 포함 전체 경로**끼리 비교한다(`activeNavHref`) — usePathname 대체.
	 * `$app/paths` 의 `base` 를 빼서 맞추면 안 된다 — `paths.relative` 기본값 때문에 SSR 에서 `base` 가 `.` · `..` 다.
	 * `disabled` 탭(아직 없는 단계 — 브랜드 콘솔 1단계의 상품·캠페인·주문·내 정보)은 링크 대신 `aria-disabled` span 으로 그리고 `title` 로 예고한다.
	 */
	export type ConsoleTabIcon = 'home' | 'box' | 'flag' | 'chart' | 'truck' | 'user';
	/**
	 * `match` — 이 탭에 속하지만 href 아래가 아닌 경로(접두 없는 콘솔 경로). 탭 하나가 여러 화면을 묶을 때 쓴다.
	 * 예: 관리자 "정산" 탭의 화면 칩은 `/orders` `/payments` `/revenue` `/cs` 로도 간다 — 그 화면에서도 탭이 켜져야 한다.
	 * 비워 두면 href 아래만 활성이다(기존 동작).
	 */
	export type ConsoleTab = { href: string; label: string; icon: ConsoleTabIcon; disabled?: boolean; title?: string; match?: readonly string[] };
</script>

<script lang="ts">
	import { activeNavHref } from '@sellery/db/console-paths';

	let { tabs, pathname = '/' }: { tabs: ConsoleTab[]; pathname?: string } = $props();
	/**
	 * 겹치는 탭이 있으면 더 구체적인 쪽만 활성 — 정산 칩(`money-nav`)과 같은 함수를 쓴다.
	 * `match` 로 넘어온 경로도 그 탭의 것으로 본다(가장 구체적인 항목이 이기므로 하위 탭과 충돌하지 않는다).
	 */
	const hrefsOf = (t: ConsoleTab) => [t.href, ...(t.match ?? [])];
	const active = $derived.by(() => {
		const usable = tabs.filter((t) => !t.disabled);
		const hit = activeNavHref(pathname, usable.flatMap(hrefsOf));
		return hit === null ? null : (usable.find((t) => hrefsOf(t).includes(hit))?.href ?? null);
	});
	const isActive = (href: string) => active === href;
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
	{:else if t.icon === 'truck'}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></svg>
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
