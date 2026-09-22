<script lang="ts" module>
	export type NavUser = { name: string } | null;
</script>

<script lang="ts">
	/**
	 * 서브내비 (ux-spec §2.2 · web sub-nav.tsx · 프로토타입 SCREENS.customer 순서): `진행 중인 판매`(/) · `인플루언서`(/influencers) · `내 주문`(/account/orders, 로그인 시만) · `셀러리 소개`(/about) · 우측 persona.
	 * `.on` = 현재 경로 (링크 페이지 /s/… 에서는 아무것도 on 아님). pathname 은 레이아웃이 `page.url.pathname` 으로 넘긴다.
	 * persona: 로그아웃 [카카오 로그인] → /login?next={현재 경로} · 로그인 [kv-av] **{name}**님 [로그아웃].
	 */
	import KakaoIcon from './icons/KakaoIcon.svelte';
	import SignOutButton from './SignOutButton.svelte';

	let { user, pathname = '/' }: { user: NavUser; pathname?: string } = $props();

	const tabs = $derived([
		{ href: '/', label: '진행 중인 판매' },
		{ href: '/influencers', label: '인플루언서' },
		...(user ? [{ href: '/account/orders', label: '내 주문' }] : []),
		{ href: '/about', label: '셀러리 소개' }
	]);
	const isOn = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));
	const initial = $derived((user?.name || '고객').slice(0, 1));
</script>

<nav class="subnav" aria-label="주요 메뉴">
	{#each tabs as t (t.href)}
		<a href={t.href} class={isOn(t.href) ? 'tab on' : 'tab'} aria-current={isOn(t.href) ? 'page' : undefined}>{t.label}</a>
	{/each}
	<div class="persona">
		{#if user}
			<span class="kv-av" aria-hidden="true">{initial}</span>
			<span class="who"><b>{user.name}</b>님</span>
			<SignOutButton class="sm ghost" />
		{:else}
			<a href="/login?next={encodeURIComponent(pathname)}" class="btn sm kakao"><KakaoIcon /> 카카오 로그인</a>
		{/if}
	</div>
</nav>
