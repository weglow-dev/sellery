<script lang="ts">
	import { enhance } from '$app/forms';
	import { INPUT_LG, LABEL } from '$lib/ui';
	import AuthShell from '$lib/components/AuthShell.svelte';

	/** 비밀번호 찾기 — 이메일을 받으면 재설정 링크 메일. 계정 유무와 무관하게 같은 안내 */
	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>비밀번호 찾기 — MYR Creator</title></svelte:head>

<AuthShell title="비밀번호 찾기" sub="가입한 이메일로 비밀번호를 새로 정하는 링크를 보내드려요">
	{#if form?.sent}
		<p class="rounded-[14px] border border-white/10 bg-white/4 px-4 py-4 text-[14px] leading-[1.6] text-white/80" role="status">
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
			<label class="flex flex-col gap-2">
				<span class={LABEL}>이메일</span>
				<input class={INPUT_LG} type="email" name="email" autocomplete="username" required value={form?.email ?? ''} />
			</label>
			{#if form?.message}<p class="text-[13px] text-accent" role="alert">{form.message}</p>{/if}
			<button type="submit" disabled={busy} class="mt-2 h-14 rounded-2xl bg-accent text-[16px] font-extrabold text-bg disabled:opacity-60">{busy ? '보내는 중…' : '재설정 메일 받기'}</button>
		</form>
	{/if}
	<a href="/login" class="mt-6 inline-block text-[13px] font-semibold text-white/70 underline-offset-4 hover:underline">로그인으로 돌아가기</a>
</AuthShell>
