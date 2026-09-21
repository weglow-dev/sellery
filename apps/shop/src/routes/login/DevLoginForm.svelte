<script lang="ts">
	/**
	 * 개발 전용 이메일/비밀번호 로그인 (web login-client.tsx DevLoginForm) — +page.svelte 가 `dev && PUBLIC_DEV_LOGIN==='1'` 일 때만 렌더한다.
	 * `signInWithPassword` 성공 → 서버가 볼 수 있도록 전체 이동 (쿠키 세션 반영) + `?welcome=1` 토스트 1회.
	 * 사용자는 `node --env-file=.env.local packages/db/scripts/dev-user.mjs <email> <password>` 로 만든다.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';

	let { next }: { next: string } = $props();
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let msg = $state<string | null>(null);

	/** 로그인 뒤 목적지 — 전체 이동 (쿠키 세션 반영). `?welcome=1` 로 토스트 1회. */
	function goAfterLogin(to: string) {
		const dest = new URL(to, window.location.origin);
		dest.searchParams.set('welcome', '1');
		window.location.assign(dest.toString());
	}

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		msg = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) {
			msg = `실패: ${error.message}`;
			busy = false;
			return;
		}
		goAfterLogin(next);
	}
</script>

<form onsubmit={onSubmit} class="mt-4 rounded-card border-2 border-dashed border-soft-line bg-surface-2 p-4 text-[12.5px]">
	<p class="m-0 mb-2 font-mono text-[11.5px] font-bold uppercase tracking-[.14em] text-mute">DEV LOGIN (이메일 · 비밀번호)</p>
	<label class="mb-2 block">
		<span class="mb-1 block text-mute">이메일</span>
		<input type="email" name="email" autocomplete="username" required bind:value={email} class="w-full border-2 border-line bg-surface px-3 py-2 font-mono" />
	</label>
	<label class="mb-3 block">
		<span class="mb-1 block text-mute">비밀번호</span>
		<input type="password" name="password" autocomplete="current-password" required bind:value={password} class="w-full border-2 border-line bg-surface px-3 py-2 font-mono" />
	</label>
	<button type="submit" disabled={busy} class="w-full border-2 border-line bg-ink px-4 py-2.5 font-mono text-[12.5px] font-bold text-surface shadow-hs-accent disabled:cursor-wait disabled:opacity-45">
		{busy ? '로그인 중…' : '개발용 로그인'}
	</button>
	{#if msg}
		<p role="alert" class="mt-2 text-danger">{msg}</p>
	{/if}
	<p class="mt-2 text-[11px] text-mute">계정 생성: <code>node --env-file=.env.local packages/db/scripts/dev-user.mjs &lt;email&gt; &lt;password&gt;</code></p>
</form>
