<script lang="ts" module>
	/**
	 * 파트너 콘솔 셸 — web (partner)/partner-shell.tsx 1:1 (docs/inf-console-plan.md §2.1 · docs/monorepo-migration.md §5.1 "셸" · PR-8).
	 * 상단 바(워드마크 → /home · 콘솔 라벨 · 우측 활동명·등급·🥬·로그아웃) · 본문 · 모바일 하단 탭 5개. 스타일은 css/site.css `.console-*`.
	 *
	 * href 는 전부 `consolePath(role, …)`(경로 모드 고정 — `/influencer/home`). 호스트 모드(`host` prop)는 결정 11 로 폐기됐다.
	 * 우측 자리(`me`)는 앱 레이아웃이 `getSellerContext()`(DB 게이트 아님 — 표시용) 로 채운다. 세션·행이 없으면 비워 둔다(공개 페이지).
	 * 정지 계정은 이름만(grade · balance null). 로그아웃은 콘솔 전용 `POST /influencer/auth/signout?next=/influencer/login`(결정 15).
	 * 게이트는 셸이 아니라 각 page 의 `requireSeller()` · `requireBrand()` 다(결정 6). 인플루언서 탭 5개는 전부 활성(상품·캠페인 3단계 · 매출 5단계), 브랜드 탭 5개도 전부 활성(상품·캠페인 2단계 · 주문 4단계 · 내 정보 5단계 — brand-console-plan §6).
	 */
	import type { ConsoleRole } from '@sellery/db/console-paths';
	import type { ConsoleTab } from './ConsoleTabs.svelte';

	/** 상단 바 우측 표시값 — 세션·행이 있을 때만 (suspended 는 이름만, 잔액 없음) */
	export type ShellMe = { name: string; grade: string | null; balance: number | null };

	export const ROLE_LABEL: Record<ConsoleRole, string> = {
		seller: '인플루언서 콘솔',
		brand: '브랜드 콘솔'
	};

	/* 탭 href 는 접두 없는 콘솔 경로 — 셸이 consolePath 로 접두를 붙인다. */
	export const TABS: Record<ConsoleRole, ConsoleTab[]> = {
		seller: [
			{ href: '/home', label: '홈', icon: 'home' },
			{ href: '/products', label: '상품', icon: 'box' },
			{ href: '/campaigns', label: '캠페인', icon: 'flag' },
			{ href: '/sales', label: '매출', icon: 'chart' },
			{ href: '/my', label: '내 정보', icon: 'user' }
		],
		// 브랜드 = 홈 · 상품 · 캠페인 · 주문 · 내 정보 (docs/brand-console-plan.md 결정 6 — 매일 할 일은 발송·CS; /sales /settle /cs 는 홈·주문·내 정보 안의 링크).
		// 단계가 열리기 전 탭은 `disabled`(링크 대신 aria-disabled span · title 예고) 였다 — 상품·캠페인 2단계 · 주문 4단계 · 내 정보 5단계에서 전부 풀렸다.
		brand: [
			{ href: '/home', label: '홈', icon: 'home' },
			{ href: '/products', label: '상품', icon: 'box' },
			{ href: '/campaigns', label: '캠페인', icon: 'flag' },
			{ href: '/orders', label: '주문', icon: 'truck' },
			{ href: '/my', label: '내 정보', icon: 'user' }
		]
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { consolePath } from '@sellery/db/console-paths';
	import Wordmark from '../Wordmark.svelte';
	import GradeBox from '../GradeBox.svelte';
	import ConsoleTabs from './ConsoleTabs.svelte';

	let {
		role = 'seller',
		me = null,
		pathname = '/',
		children
	}: { role?: ConsoleRole; me?: ShellMe | null; pathname?: string; children: Snippet } = $props();

	const tabs = $derived(TABS[role].map((t) => ({ ...t, href: consolePath(role, t.href) })));
	const homeHref = $derived(consolePath(role, '/home'));
	const signoutAction = $derived(`${consolePath(role, '/auth/signout')}?next=${encodeURIComponent(consolePath(role, '/login'))}`);
</script>

<a href="#main" class="skip">본문으로 건너뛰기</a>
<header class="console-bar">
	<Wordmark href={homeHref} />
	<span class="console-label">{ROLE_LABEL[role]}</span>
	<div class="console-bar-right">
		{#if me}
			<div class="console-me">
				<span class="nm" title={me.name}>{me.name}</span>
				<GradeBox grade={me.grade} sm />
				{#if me.balance !== null}
					<span class="cel" title="셀러리 포인트 잔액">🥬 {me.balance}</span>
				{/if}
				<form method="post" action={signoutAction}>
					<button type="submit" class="ghost sm" aria-label="로그아웃">로그아웃</button>
				</form>
			</div>
		{/if}
	</div>
</header>
<main id="main" class="console-main">
	{@render children()}
</main>
<ConsoleTabs {tabs} {pathname} />
