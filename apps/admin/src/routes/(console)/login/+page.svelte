<script lang="ts">
	/**
	 * 이메일/비밀번호 로그인 카드 — apps/brand `(console)/login/+page.svelte` 의 관리자 판.
	 * `next` 는 서버가 `adminNextOf` 로 정규화한 값 — 그대로 믿는다. 성공하면 전체 이동(`location.assign`) — 서버 load 가 쿠키 세션을 보게 한다.
	 * 실패 잠금은 Supabase Auth 레이트리밋에 맡긴다. 카카오 버튼 없음 — 관리자 계정은 고객 카카오 계정과 분리된 이메일 계정.
	 * `foreign`(고객·인플루언서·브랜드 세션) 이면 로그아웃 폼(`/admin/auth/signout?next=/admin/login`) 을 먼저 보인다.
	 * 문구는 `$lib/login-text`(한국어 · 영어) — 아래 [English] / [한국어] 로 바꾼다(메타 앱 검수자용).
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { base } from '$app/paths';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { loginText } from '$lib/login-text';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
	const t = $derived(loginText(data.lang));
	function messageFor(code: string | undefined, message: string): string {
		if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return t.err.credentials;
		if (code === 'email_not_confirmed' || /not confirmed/i.test(message)) return t.err.unconfirmed;
		if (code === 'over_request_rate_limit' || /rate limit/i.test(message)) return t.err.rate;
		return t.err.generic;
	}

	const foreignRole = $derived(data.foreignRole ? (t.role[data.foreignRole] ?? null) : null);
	const foreign = $derived(t.foreign(data.foreignEmail ?? foreignRole, foreignRole));
	const signoutAction = `${base}/auth/signout?next=${encodeURIComponent(`${base}/login`)}`;

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
		if (!EMAIL_RE.test(em)) return void (error = t.err.email);
		if (password.length < 8) return void (error = t.err.short);
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
	<title>{t.title}</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">{t.label}</div>
		<h2 class="console-title">{t.heading}</h2>
		<p class="meta">{t.intro}</p>
		{#if data.foreign}
			<div class="notice" role="status" style="margin:0 0 14px">
				{foreign.before}<b>{foreign.who}</b>{foreign.after}
				<form method="post" action={signoutAction} style="margin-top:10px">
					<button type="submit" class="sm">{t.foreignSignout}</button>
				</form>
			</div>
		{/if}
		<form onsubmit={onSubmit} novalidate>
			<div class="fld">
				<label for="email">{t.email}</label>
				<input id="email" type="email" name="email" autocomplete="username" inputmode="email" placeholder="name@weglow.biz" required bind:value={email} />
			</div>
			<div class="fld">
				<label for="password">{t.password}</label>
				<div style="display:flex;align-items:center;gap:4px">
					<input id="password" type={showPw ? 'text' : 'password'} name="password" autocomplete="current-password" placeholder={t.passwordPh} required bind:value={password} />
					<button type="button" class="ghost sm" onclick={() => (showPw = !showPw)} aria-label={t.toggleAria}>{showPw ? t.hide : t.show}</button>
				</div>
			</div>
			<p class="console-err" role="alert">{error ?? ''}</p>
			<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? t.busy : t.submit}</button>
		</form>
		<div class="foot">
			<span>{t.foot}</span>
		</div>
	</section>
	<p class="meta" style="text-align:center;margin-top:14px">
		<a href={data.siteUrl}>{t.site}</a> · <a href="{base}/demo">{t.demo}</a> ·
		<a href={data.langToggle.query} lang={data.langToggle.to} hreflang={data.langToggle.to} data-sveltekit-reload>{data.langToggle.label}</a>
	</p>
</div>
