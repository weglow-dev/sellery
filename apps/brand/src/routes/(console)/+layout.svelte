<script lang="ts">
	/**
	 * 브랜드 콘솔 셸 — apps/influencer `(console)/+layout.svelte` 의 브랜드 판 (docs/brand-console-plan.md §2 · 결정 6).
	 * `PartnerShell role="brand"`(@sellery/ui/site): 상단 바(워드마크 → /brand/home · "브랜드 콘솔" · 상호·등급·🥬·로그아웃) · 본문 · 하단 탭 5(홈 · 상품 · 캠페인 · 주문 · 내 정보 — 1단계는 홈만 활성, 나머지는 `disabled` 예고).
	 * `me` 는 +layout.server.ts(getBrandContext — 표시용). 활성 탭은 `page.url.pathname`(접두 포함) 으로 판정. 게이트는 각 page 의 requireBrand().
	 * `(demo)` 그룹은 이 레이아웃 밖(형제 그룹) — 데모 띠·AppShell·theme.css 는 (demo)/+layout.svelte 에 있다.
	 */
	import '../../app.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { PartnerShell } from '@sellery/ui/site';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<PartnerShell role="brand" me={data.me} pathname={page.url.pathname}>
	{@render children()}
</PartnerShell>
