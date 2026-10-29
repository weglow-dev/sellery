<script lang="ts">
	/** 로그인 — 카카오 하나. `signInWithOAuth({ provider:'kakao', redirectTo: origin + '/auth/callback?next=…' })` · `scopes` 지정 금지
	 *  (지정하면 카카오 싱크 간편가입 화면을 우회 · 동의 항목은 카카오 콘솔이 결정 — apps/shop login 과 같은 규칙).
	 *  개발용 이메일 폼은 서버가 devLogin 을 true 로 줄 때만. */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { browserSupabase } from '$lib/supabase-browser';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import DevLoginForm from './DevLoginForm.svelte';

	let { data } = $props();

	const FAIL_MSG = '로그인에 실패했어요. 잠시 후 다시 시도해주세요.';
	let loading = $state(false);
	// svelte-ignore state_referenced_locally
	let error = $state<string | null>(data.authError ? FAIL_MSG : null);

	async function signInWithKakao() {
		if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
			error = '로그인이 아직 설정되지 않았어요';
			return;
		}
		loading = true;
		error = null;
		const supabase = browserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error: e } = await supabase.auth.signInWithOAuth({
			provider: 'kakao',
			options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(data.next)}` }
		});
		if (e) {
			console.error('[login] Kakao OAuth failed:', e);
			error = FAIL_MSG;
			loading = false;
		}
		// 성공하면 브라우저가 카카오로 이동한다
	}
</script>

<svelte:head>
	<title>로그인 — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex animate-slide-in flex-col lg:mx-auto lg:max-w-[460px] lg:px-10 lg:pt-16 lg:pb-20">
	<BackHeader title="로그인" />
	<div class="px-5 pt-4 lg:px-0 lg:pt-0">
		<div class="rounded-[26px] border border-white/8 bg-panel p-6">
			<img src="/myr-logo.svg" alt="MYR" class="h-8 w-auto" />
			<h1 class="mt-5 text-[24px] leading-[1.3] font-extrabold tracking-[-.03em]">카카오로 3초 만에<br />시작해요</h1>
			<p class="mt-2 text-[14px] leading-[1.55] text-fg-soft">주문 · 배송 · 환불을 한 곳에서, 찜한 레시피를 기기 어디서나.</p>

			<button
				type="button"
				onclick={signInWithKakao}
				disabled={loading}
				class="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-[16px] font-extrabold text-[#191919] transition-opacity disabled:cursor-wait disabled:opacity-60"
			>
				<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#191919" d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5 4.5 6.4l-1 3.6c-.1.3.3.6.5.4l4.3-2.9c.6.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.6S17.5 3 12 3z" /></svg>
				{loading ? '카카오로 이동 중…' : '카카오 로그인'}
			</button>

			{#if error}
				<p role="alert" class="mt-3 rounded-[14px] border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-center text-[13px] text-accent">{error}</p>
			{/if}

			<p class="mt-4 text-center text-[12px] leading-[1.55] text-fg-faint">
				로그인하면 <a href="/terms" class="underline underline-offset-2">이용약관</a>과 <a href="/privacy" class="underline underline-offset-2">개인정보처리방침</a>에 동의한 것으로 봅니다
			</p>
			<p class="mt-3 border-t border-dashed border-white/10 pt-3 text-center text-[12.5px] leading-[1.55] text-fg-faint">로그인 없이도 살 수 있어요 — 결제 때 비회원으로 구매를 고르면 돼요</p>
		</div>

		{#if data.devLogin}
			<DevLoginForm next={data.next} />
		{/if}
	</div>
</div>
