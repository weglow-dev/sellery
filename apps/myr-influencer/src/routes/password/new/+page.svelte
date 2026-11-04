<script lang="ts">
	import { enhance } from '$app/forms';
	import { AUTH_LABEL, authButton, authInput } from '$lib/auth-ui';
	import { PASSWORD_MIN } from '$lib/console-auth';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import ErrorText from '$lib/components/auth/ErrorText.svelte';
	import PasswordToggle from '$lib/components/auth/PasswordToggle.svelte';

	/** 새 비밀번호 — 재설정 메일 링크로 들어온다. 바꾸면 로그인 화면으로(새 비밀번호로 로그인) */
	let { data, form } = $props();
	let busy = $state(false);
	let showPw = $state(false);
	let password = $state('');
	let confirm = $state('');
	const ready = $derived(password.length >= PASSWORD_MIN && password === confirm);
</script>

<svelte:head><title>새 비밀번호 — MYR Creator</title></svelte:head>

<AuthShell title="새 비밀번호 정하기" sub={data.email ? `${data.email} 계정의 비밀번호를 정해요` : null}>
	<form
		method="POST"
		class="flex flex-col gap-4"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<div class="flex flex-col gap-2">
			<label for="password" class={AUTH_LABEL}>새 비밀번호 <span class="font-normal text-white/45">({PASSWORD_MIN}자 이상)</span></label>
			<div class="relative">
				<input id="password" name="password" type={showPw ? 'text' : 'password'} autocomplete="new-password" required minlength={PASSWORD_MIN} bind:value={password} class={authInput({ filled: !!password, padRight: true })} />
				<PasswordToggle bind:shown={showPw} />
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<label for="confirm" class={AUTH_LABEL}>비밀번호 확인</label>
			<input id="confirm" name="confirm" type={showPw ? 'text' : 'password'} autocomplete="new-password" required minlength={PASSWORD_MIN} placeholder="한 번 더 입력" bind:value={confirm} class={authInput({ filled: !!confirm, invalid: !!confirm && confirm !== password })} />
		</div>
		{#if form?.message}<ErrorText text={form.message} />{/if}
		<button type="submit" disabled={busy} class="{authButton(ready)} mt-2 lg:h-14">{busy ? '저장 중…' : '비밀번호 저장'}</button>
	</form>
</AuthShell>
