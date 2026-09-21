<script lang="ts">
	/**
	 * 이메일/비밀번호 로그인 카드 — apps/influencer `(console)/login/+page.svelte` 의 브랜드 판 (docs/brand-console-plan.md §3 · §5).
	 * `next` 는 서버가 `consoleNextOf` 로 정규화한 값 — 그대로 믿는다. 성공하면 전체 이동(`location.assign`) — 서버 load 가 쿠키 세션을 보게 한다.
	 * 실패 잠금은 Supabase Auth 레이트리밋에 맡긴다. 카카오 버튼 없음 — 브랜드 계정은 고객 카카오 계정과 분리된 이메일 계정.
	 * `foreign`(고객 카카오 세션 · 인플루언서 세션) 이면 로그아웃 폼(콘솔 전용 `/brand/auth/signout?next=/brand/login`) 을 먼저 보인다.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { EMAIL_RE } from '@sellery/db/brand/signup-rules';
	import { consolePath } from '@sellery/db/console-paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const GENERIC = '로그인에 실패했어요. 잠시 후 다시 시도해주세요.';
	function messageFor(code: string | undefined, message: string): string {
		if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않아요.';
		if (code === 'email_not_confirmed' || /not confirmed/i.test(message)) return '이메일 인증이 아직 끝나지 않았어요 — 받은 메일의 인증 링크를 눌러주세요.';
		if (code === 'over_request_rate_limit' || /rate limit/i.test(message)) return '시도가 너무 많아요 — 잠시 후 다시 시도해주세요.';
		return GENERIC;
	}

	const loginPath = consolePath('brand', '/login');
	const signoutAction = `${consolePath('brand', '/auth/signout')}?next=${encodeURIComponent(loginPath)}`;
	const influencerLogin = consolePath('seller', '/login');

	let email = $state('');
	let password = $state('');
	let showPw = $state(false);
	let busy = $state(false);
	// `?error=` 는 첫 렌더의 초기 문구
	// svelte-ignore state_referenced_locally
	let error = $state<string | null>(data.initialError);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const em = email.trim().toLowerCase();
		if (!EMAIL_RE.test(em)) return void (error = '이메일 형식을 확인해주세요.');
		if (password.length < 8) return void (error = '비밀번호는 8자 이상이에요.');
		busy = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error: e2 } = await supabase.auth.signInWithPassword({ email: em, password });
		if (e2) {
			error = messageFor(e2.code, e2.message);
			busy = false;
			return;
		}
		window.location.assign(data.next);
	}
</script>

<svelte:head>
	<title>로그인 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">로그인</h2>
		<p class="meta">입점 신청 때 등록한 담당자 이메일과 비밀번호로 로그인합니다. 브랜드 계정은 고객 카카오 계정·인플루언서 계정과 별개의 이메일 계정이에요.</p>
		{#if data.foreign}
			<div class="notice" role="status" style="margin:0 0 14px">
				{#if data.foreignKind === 'seller'}
					지금 <b>{data.foreignEmail ?? '인플루언서'}</b> 계정(인플루언서)으로 로그인돼 있어요. 브랜드 콘솔은 별도의 브랜드 담당자 이메일 계정으로 들어갑니다 — 먼저 로그아웃한 뒤 브랜드 계정으로 로그인하거나, <a href={influencerLogin}>인플루언서 콘솔</a>로 돌아가주세요.
				{:else}
					지금 <b>{data.foreignEmail ?? '고객(카카오)'}</b> 계정으로 로그인돼 있어요. 브랜드 콘솔은 별도의 이메일 계정으로 들어갑니다 — 먼저 로그아웃한 뒤 브랜드 계정으로 로그인해주세요.
				{/if}
				<form method="post" action={signoutAction} style="margin-top:10px">
					<button type="submit" class="sm">로그아웃하고 브랜드 계정으로</button>
				</form>
			</div>
		{/if}
		<form onsubmit={onSubmit} novalidate>
			<div class="fld">
				<label for="email">이메일</label>
				<input id="email" type="email" name="email" autocomplete="username" inputmode="email" placeholder="name@company.com" required bind:value={email} />
			</div>
			<div class="fld">
				<label for="password">비밀번호</label>
				<div style="display:flex;align-items:center;gap:4px">
					<input id="password" type={showPw ? 'text' : 'password'} name="password" autocomplete="current-password" placeholder="8자 이상" required bind:value={password} />
					<button type="button" class="ghost sm" onclick={() => (showPw = !showPw)} aria-label="비밀번호 표시 전환">{showPw ? '숨김' : '표시'}</button>
				</div>
			</div>
			<p class="console-err" role="alert">{error ?? ''}</p>
			<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? '로그인 중…' : '로그인 →'}</button>
			<p class="meta" style="margin-top:10px;text-align:right">
				<a href={consolePath('brand', '/password')} style="text-decoration:underline;text-underline-offset:2px">비밀번호를 잊으셨나요?</a>
			</p>
		</form>
		<div class="foot">
			<span>아직 입점 전인가요?</span>
			<a href={consolePath('brand', '/signup')}>브랜드 입점 신청</a>
		</div>
	</section>
	<p class="meta" style="text-align:center;margin-top:14px">
		<a href={data.siteUrl}>← 셀러리 고객 사이트</a> · <a href={influencerLogin}>인플루언서 콘솔</a>
	</p>
</div>
