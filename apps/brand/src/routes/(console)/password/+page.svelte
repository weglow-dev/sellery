<script lang="ts">
	/**
	 * 비밀번호 재설정 요청 — apps/influencer `(console)/password/+page.svelte` 의 브랜드 판.
	 * `resetPasswordForEmail` → 메일(token_hash · type=recovery) → `/brand/auth/confirm` → `/brand/password/new`.
	 * 성공·미가입 모두 같은 문구("가입된 이메일이라면 보냈어요") — 계정 존재 여부 비노출. 레이트리밋만 따로 안내.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { consolePath } from '@sellery/db/console-paths';
	import { EMAIL_RE } from '@sellery/db/brand/signup-rules';

	let email = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let done = $state(false);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const em = email.trim().toLowerCase();
		if (!EMAIL_RE.test(em)) return void (error = '이메일 형식을 확인해주세요.');
		busy = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error: e2 } = await supabase.auth.resetPasswordForEmail(em, {
			redirectTo: `${window.location.origin}${consolePath('brand', '/auth/confirm')}?next=${encodeURIComponent(consolePath('brand', '/password/new'))}`
		});
		busy = false;
		if (e2 && (e2.code === 'over_email_send_rate_limit' || e2.code === 'over_request_rate_limit' || /rate limit/i.test(e2.message))) {
			error = '메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.';
			return;
		}
		// 그 밖의 오류(미가입 등)는 구분해 보여 주지 않는다
		done = true;
	}
</script>

<svelte:head>
	<title>비밀번호 재설정 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">비밀번호 재설정</h2>
		<p class="meta">등록한 담당자 이메일을 입력하면 재설정 링크를 보내드려요. 링크는 다른 기기에서 열어도 됩니다.</p>
		{#if done}
			<p class="console-ok" role="status" style="margin-top:12px">✓ 가입된 이메일이라면 재설정 링크를 보냈어요. 계정 존재 여부는 보안상 표시하지 않습니다.</p>
		{:else}
			<form onsubmit={onSubmit} novalidate>
				<div class="fld">
					<label for="email">이메일</label>
					<input id="email" type="email" name="email" autocomplete="username" inputmode="email" required bind:value={email} />
				</div>
				<p class="console-err" role="alert">{error ?? ''}</p>
				<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? '보내는 중…' : '재설정 링크 보내기'}</button>
			</form>
		{/if}
		<div class="foot">
			<span></span>
			<a href={consolePath('brand', '/login')}>로그인으로</a>
		</div>
	</section>
</div>
