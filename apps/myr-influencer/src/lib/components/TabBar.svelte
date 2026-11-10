<script lang="ts">
	import { page } from '$app/state';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 하단 플로팅 탭바 — 홈 · CS 관리(처리 대기 뱃지) · 주문(6번 · 읽기 전용) · 정산(0089) · 내 제품. 레이아웃이 이 다섯 화면에서만 보여 준다 */
	const tabs = [
		{ href: '/', name: '홈', ic: 'home' },
		{ href: '/cs', name: 'CS 관리', ic: 'cs' },
		{ href: '/orders', name: '주문', ic: 'order' },
		{ href: '/settle', name: '정산', ic: 'wallet' },
		{ href: '/products', name: '내 제품', ic: 'box' }
	];
	/** 처리 대기 CS = 교환·환불 처리 대기(0078) + 고객 문의 답변 대기(0075) */
	const csCount = $derived(app.csBadge(page.data.inqWaiting, page.data.claimWaiting));
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<!-- 앱 셸(+layout.svelte) 바닥에 보통 흐름으로 놓인다 — fixed/sticky 는 모바일 브라우저에서 잘려서 쓰지 않는다(myr-shop 과 같은 이유) -->
<nav class="w-full shrink-0 bg-bg px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="주요 메뉴">
	<!-- 탭마다 폭을 똑같이(w-14 · 56px) 고정하고 그 사이를 똑같이 벌린다(justify-between) — 글자 폭(홈 · CS 관리 · 내 제품)과 상관없이 칸 너비 · 간격이 모두 같다(2026-11-10).
	     5 × 56px = 280px 라 360px 폭 폰(바 안쪽 296px)까지 넘치지 않는다 -->
	<div class="flex h-16 items-center justify-between rounded-[22px] border border-white/8 bg-panel px-3 shadow-[0_10px_30px_rgba(0,0,0,.4)]">
		{#each tabs as t (t.href)}
			{@const on = active(t.href)}
			<a href={t.href} aria-current={on ? 'page' : undefined} class="relative flex h-[52px] w-14 shrink-0 flex-col items-center justify-center gap-1 transition-colors {on ? 'text-accent' : 'text-white/45'}">
				<Icon id={t.ic} size={22} />
				<span class="text-[11px] font-bold whitespace-nowrap">{t.name}</span>
				{#if t.href === '/cs' && csCount}
					<span class="absolute top-2 right-[calc(50%-18px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold tabular-nums text-bg" aria-label="처리 대기 {csCount}건">{csCount}</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>
