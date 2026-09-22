<script lang="ts">
	/**
	 * 관리자 홈 — 지금은 **자리만**. 실제 위젯은 담당별로 이 아래에 붙인다.
	 *   파트너 관리(인플루언서·브랜드·상품 검수) · 정산(정산 실행·매출) — 한 파일이라 위젯을 추가할 때 서로 알려야 한다(소유자 규칙은 PR 본문).
	 * 로그아웃·워드마크·탭은 셸(PartnerShell)이 그린다 — 이 파일은 본문만.
	 */
	import { base } from '$app/paths';
	import { dev } from '$app/environment';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>관리자 홈 — 셀러리</title>
</svelte:head>

<h2 class="console-title">운영</h2>
<p class="meta">{data.email ?? '운영팀'} · <code>app_role()</code> = <b>admin</b></p>

<section class="card static">
	<h4>아직 화면이 없습니다</h4>
	<p class="meta">
		인플루언서 관리(목록 · 정지/복귀 · 채널 인증 승인) · 브랜드 관리 · 상품 검수 · 정산 실행은 순서대로 열립니다.
		그때까지는 <code>packages/db/scripts/partner-admin.mjs</code> 로 처리합니다 — <code>list</code> ·
		<code>channels --pending</code> · <code>verify-channel</code> · <code>suspend</code> · <code>products --pending</code> ·
		<code>review-product</code>.
	</p>
	{#if dev}
		<div class="foot">
			<a href="{base}/demo">데모 화면 (dev 전용)</a>
		</div>
	{/if}
</section>
