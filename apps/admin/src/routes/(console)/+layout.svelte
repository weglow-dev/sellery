<script lang="ts">
	/**
	 * 관리자 콘솔 셸 — apps/brand `(console)/+layout.svelte` 의 관리자 판.
	 * `PartnerShell role="admin"`(@sellery/ui/site): 상단 바(워드마크 → /admin/home · "관리자 콘솔" · 운영자 이메일 · 로그아웃) · 본문 ·
	 * 하단 탭 5(홈 · 인플루언서 · 브랜드 · 상품 · 정산 — 홈만 활성, 나머지는 화면이 생기는 PR 에서 `TABS.admin` 의 `disabled` 를 지운다).
	 * `me` 는 +layout.server.ts(getAdminContext — 표시용). 활성 탭은 `page.url.pathname`(접두 포함) 으로 판정.
	 * 게이트는 이 레이아웃이 아니라 각 page 의 `requireAdmin()` 이 한다 (docs/inf-console-plan.md 결정 6) — hooks 세션 게이트는 보조 가드.
	 * `(demo)` 그룹은 이 레이아웃 밖(형제 그룹) — 데모 띠·AppShell·theme.css 는 (demo)/+layout.svelte 에 있다(결정 12).
	 */
	import '../../app.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { PartnerShell } from '@sellery/ui/site';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<PartnerShell role="admin" me={data.me} pathname={page.url.pathname}>
	{@render children()}
</PartnerShell>
