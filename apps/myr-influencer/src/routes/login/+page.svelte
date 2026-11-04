<script lang="ts">
	import { enhance } from '$app/forms';
	import { INPUT_LG, LABEL } from '$lib/ui';
	import AuthShell from '$lib/components/AuthShell.svelte';

	/** 로그인 — 이메일 · 비밀번호. 서버 form action(+page.server.ts) 이 처리하고, use:enhance 로 새로고침 없이 오류를 보여준다 */
	let { data, form } = $props();
	let busy = $state(false);
	const message = $derived(form?.message ?? data.linkError);
</script>

<svelte:head><title>로그인 — MYR Creator</title></svelte:head>

<AuthShell title="크리에이터 로그인" sub="내 제품 · 주문 · 교환/환불 문의를 관리해요">
	{#if data.reset}
		<p class="mb-4 rounded-[14px] border border-mint/30 bg-mint/10 px-4 py-3 text-[13px] leading-[1.55] text-mint" role="status">비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요.</p>
	{/if}
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
		<input type="hidden" name="next" value={data.next} />
		<label class="flex flex-col gap-2">
			<span class={LABEL}>이메일</span>
			<input class={INPUT_LG} type="email" name="email" autocomplete="username" required value={form?.email ?? ''} aria-invalid={form?.field === 'email'} />
		</label>
		<label class="flex flex-col gap-2">
			<span class={LABEL}>비밀번호</span>
			<input class={INPUT_LG} type="password" name="password" autocomplete="current-password" required minlength="8" aria-invalid={form?.field === 'password'} />
		</label>
		{#if message}
			<p class="text-[13px] leading-[1.55] text-accent" role="alert">{message}</p>
		{/if}
		<button type="submit" disabled={busy} class="mt-2 h-14 rounded-2xl bg-accent text-[16px] font-extrabold text-bg transition-opacity disabled:opacity-60">
			{busy ? '로그인 중…' : '로그인'}
		</button>
	</form>
	<div class="mt-6 flex flex-col gap-2 text-[13px] text-white/55">
		<a href="/password" class="w-fit font-semibold text-white/75 underline-offset-4 hover:underline">비밀번호를 잊었어요</a>
		<span>계정은 MYR 운영팀이 만들어 드려요</span>
	</div>
</AuthShell>
