<script lang="ts">
	import { enhance } from '$app/forms';
	import { PASSWORD_MIN } from '$lib/console-auth';
	import { INPUT_LG, LABEL } from '$lib/ui';
	import AuthShell from '$lib/components/AuthShell.svelte';

	/** 새 비밀번호 — 재설정 · 초대 메일 링크로 들어온다. 바꾸면 로그인 화면으로(새 비밀번호로 로그인) */
	let { data, form } = $props();
	let busy = $state(false);
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
		<label class="flex flex-col gap-2">
			<span class={LABEL}>새 비밀번호 <span class="font-normal text-white/45">({PASSWORD_MIN}자 이상)</span></span>
			<input class={INPUT_LG} type="password" name="password" autocomplete="new-password" required minlength={PASSWORD_MIN} />
		</label>
		<label class="flex flex-col gap-2">
			<span class={LABEL}>한 번 더</span>
			<input class={INPUT_LG} type="password" name="confirm" autocomplete="new-password" required minlength={PASSWORD_MIN} />
		</label>
		{#if form?.message}<p class="text-[13px] text-accent" role="alert">{form.message}</p>{/if}
		<button type="submit" disabled={busy} class="mt-2 h-14 rounded-2xl bg-accent text-[16px] font-extrabold text-bg disabled:opacity-60">{busy ? '저장 중…' : '비밀번호 저장'}</button>
	</form>
</AuthShell>
