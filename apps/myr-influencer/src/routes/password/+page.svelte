<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { AUTH_LABEL, authButton, authInput } from '$lib/auth-ui';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import ErrorText from '$lib/components/auth/ErrorText.svelte';

	/** 비밀번호 찾기 — 이메일을 받으면 재설정 링크 메일. 계정 유무와 무관하게 같은 안내. 로그인 화면의 "비밀번호를 잊으셨나요?" 와 같은 처리(주소로 직접 들어온 경우) */
	let { form } = $props();
	let busy = $state(false);
	let email = $state(untrack(() => form?.email ?? ''));
</script>

<svelte:head><title>비밀번호 찾기 — MYR Creator</title></svelte:head>

<AuthShell title="비밀번호 찾기" sub="가입한 이메일로 비밀번호를 새로 정하는 링크를 보내드려요">
	{#if form?.sent}
		<p class="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-[14px] leading-[1.6] text-white/80" role="status">
			<b class="text-fg">{form.email}</b> 로 메일을 보냈어요. 메일의 버튼을 누르면 새 비밀번호를 정할 수 있어요. 몇 분 안에 오지 않으면 스팸함도 확인해주세요.
		</p>
	{:else}
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
				<label for="email" class={AUTH_LABEL}>이메일</label>
				<input id="email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="creator@myr.kr" required bind:value={email} class={authInput({ invalid: !!form?.message, filled: !!email.trim() })} />
				{#if form?.message}<ErrorText text={form.message} />{/if}
			</div>
			<button type="submit" disabled={busy} class="{authButton(true)} mt-2 lg:h-14">{busy ? '보내는 중…' : '재설정 메일 받기'}</button>
		</form>
	{/if}
	<a href="/login" class="mt-6 inline-block text-[13px] font-semibold text-white/70 underline-offset-4 hover:underline">로그인으로 돌아가기</a>
</AuthShell>
