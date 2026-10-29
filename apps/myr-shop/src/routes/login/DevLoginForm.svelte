<script lang="ts">
	/** 개발 전용 이메일/비밀번호 로그인 — +page.server.ts 가 devLogin 을 줄 때만(로컬 dev · Vercel Preview + PUBLIC_DEV_LOGIN=1).
	 *  `signInWithPassword` 성공 → 서버가 볼 수 있도록 전체 이동(쿠키 세션 반영) + `?welcome=1` 토스트 1회.
	 *  사용자는 `node --env-file=.env.local packages/db/scripts/dev-user.mjs <email> <password>` 로 만든다(.env.local 이 가리키는 Supabase 에). */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { browserSupabase } from '$lib/supabase-browser';

	let { next }: { next: string } = $props();
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let msg = $state<string | null>(null);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		msg = null;
		const supabase = browserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (error) {
			msg = `실패: ${error.message}`;
			busy = false;
			return;
		}
		const dest = new URL(next, window.location.origin);
		dest.searchParams.set('welcome', '1');
		window.location.assign(dest.toString());
	}

	const inputCls = 'h-12 w-full rounded-[12px] border border-white/10 bg-white/4 px-3.5 text-[15px] text-fg outline-none focus:border-accent';
</script>

<form onsubmit={onSubmit} class="mt-4 rounded-[20px] border border-dashed border-white/14 bg-white/2 p-4 text-[13px]">
	<p class="mb-2.5 text-[11px] font-bold tracking-[.14em] text-fg-faint uppercase">Dev login (이메일 · 비밀번호)</p>
	<label class="mb-2 block">
		<span class="mb-1 block text-fg-faint">이메일</span>
		<input type="email" name="email" autocomplete="username" required bind:value={email} class={inputCls} />
	</label>
	<label class="mb-3 block">
		<span class="mb-1 block text-fg-faint">비밀번호</span>
		<input type="password" name="password" autocomplete="current-password" required bind:value={password} class={inputCls} />
	</label>
	<button type="submit" disabled={busy} class="h-12 w-full rounded-[12px] border border-white/14 text-[14px] font-bold text-fg disabled:cursor-wait disabled:opacity-50">
		{busy ? '로그인 중…' : '개발용 로그인'}
	</button>
	{#if msg}
		<p role="alert" class="mt-2 text-accent">{msg}</p>
	{/if}
	<p class="mt-2 text-[11px] text-fg-faint">계정 생성: <code>node --env-file=.env.local packages/db/scripts/dev-user.mjs &lt;email&gt; &lt;password&gt;</code></p>
</form>
