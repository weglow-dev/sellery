<script lang="ts">
	/**
	 * 관리자 홈 스텁 — `requireAdmin()` 통과 확인용. 다음 단계에서 실제 화면(인플루언서 관리 · 채널 인증 승인 대기 큐 등)으로 대체한다.
	 * 데모 화면 9개는 `(demo)` 그룹에 그대로 있고 `/admin/demo` 에서 열린다.
	 */
	import { base } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const signoutAction = `${base}/auth/signout?next=${encodeURIComponent(`${base}/login`)}`;
</script>

<svelte:head>
	<title>관리자 홈 — 셀러리</title>
</svelte:head>

<section class="card static">
	<div class="lbl-sm">관리자 콘솔</div>
	<h2 class="console-title">로그인됐습니다</h2>
	<p class="meta">{data.email ?? '관리자'} · <code>app_role()</code> = <b>admin</b></p>
	<p class="meta">
		실제 관리자 기능은 아직 없습니다. 첫 화면은 인플루언서 관리(목록 · 정지/복귀 · 채널 인증 승인)가 될 예정입니다 —
		지금은 <code>packages/db/scripts/partner-admin.mjs</code> 로 처리합니다.
	</p>
	<div class="foot">
		<a href="{base}/demo">데모 화면 보기</a>
		<form method="post" action={signoutAction}>
			<button type="submit" class="ghost sm">로그아웃</button>
		</form>
	</div>
</section>
