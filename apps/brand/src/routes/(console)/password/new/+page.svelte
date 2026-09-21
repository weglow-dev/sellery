<script lang="ts">
	/**
	 * 새 비밀번호 폼 — apps/influencer `(console)/password/new/+page.svelte` 의 브랜드 판. `updateUser({ password })` 뒤 콘솔 홈으로 전체 이동.
	 * 규칙은 가입과 같다(영문+숫자 8자 이상, `PASSWORD_RE`).
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { consolePath } from '@sellery/db/console-paths';
	import { PASSWORD_RE } from '@sellery/db/brand/signup-rules';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!PASSWORD_RE.test(password)) return void (error = '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.');
		if (password !== confirm) return void (error = '비밀번호 확인이 일치하지 않아요.');
		busy = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error: e2 } = await supabase.auth.updateUser({ password });
		if (e2) {
			error =
				e2.code === 'same_password'
					? '이전과 다른 비밀번호를 입력해주세요.'
					: e2.code === 'weak_password'
						? '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.'
						: '비밀번호를 바꾸지 못했어요 — 링크가 만료됐다면 재설정 메일을 다시 요청해주세요.';
			busy = false;
			return;
		}
		window.location.assign(consolePath('brand', '/home'));
	}
</script>

<svelte:head>
	<title>새 비밀번호 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">새 비밀번호 설정</h2>
		{#if data.user}
			<p class="meta"><b>{data.user.email ?? '내 계정'}</b> 의 비밀번호를 새로 정합니다. 영문과 숫자를 포함해 8자 이상.</p>
			<form onsubmit={onSubmit} novalidate>
				<div class="fld">
					<label for="password">새 비밀번호</label>
					<input id="password" type="password" name="password" autocomplete="new-password" placeholder="8자 이상, 영문+숫자" required bind:value={password} />
				</div>
				<div class="fld">
					<label for="confirm">새 비밀번호 확인</label>
					<input id="confirm" type="password" name="confirm" autocomplete="new-password" required bind:value={confirm} />
				</div>
				<p class="console-err" role="alert">{error ?? ''}</p>
				<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? '저장 중…' : '비밀번호 저장 → 콘솔로'}</button>
			</form>
		{:else}
			<p class="meta">링크가 만료됐거나 세션이 없어요. 재설정 메일을 다시 요청해주세요 — 링크는 받은 뒤 1시간 안에 열어야 합니다.</p>
			<div class="btnrow" style="margin-top:14px">
				<a href={consolePath('brand', '/password')} class="btn pri sm">재설정 메일 다시 받기</a>
				<a href={consolePath('brand', '/login')} class="btn ghost sm">로그인으로</a>
			</div>
		{/if}
	</section>
</div>
