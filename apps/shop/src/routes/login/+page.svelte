<script lang="ts">
	/**
	 * 로그인 카드 (ux-spec §3.3 — 프로토타입 `.kwin` 문구 원문, 데모 계정 목록·각주는 버림) — web login-client.tsx LoginClient 1:1.
	 * `next` 는 +page.server.ts 가 이미 safeNext 로 정규화한 값 — 그대로 믿는다.
	 * 카카오: `signInWithOAuth({ provider:'kakao', options:{ redirectTo: `${origin}/auth/callback?next=…` } })` — `scopes` 지정 금지
	 * (지정하면 카카오 싱크 간편가입 화면을 우회 · 동의 항목은 카카오 콘솔이 결정, app-plan §4.1).
	 * 개발용 이메일 폼은 서버(+page.server.ts)가 `devLogin` 을 true 로 줄 때만(로컬 dev 또는 Vercel Preview + PUBLIC_DEV_LOGIN=1) — Production 은 항상 false.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { KAKAO_ICON as KakaoIcon } from '@sellery/ui/site';
	import DevLoginForm from './DevLoginForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const FAIL_MSG = '로그인에 실패했어요. 잠시 후 다시 시도해주세요.';
	let loading = $state(false);
	// `?error=auth` 는 첫 렌더의 초기 문구 (web useState 초기값과 동일)
	// svelte-ignore state_referenced_locally
	let error = $state<string | null>(data.authError ? FAIL_MSG : null);

	async function signInWithKakao() {
		loading = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error: e } = await supabase.auth.signInWithOAuth({
			provider: 'kakao',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(data.next)}`
				// `scopes` 지정 금지 — 지정하면 카카오 싱크 간편가입(약관 + 전체 동의) 화면을 우회한다.
			}
		});
		if (e) {
			console.error('[login] Kakao OAuth failed:', e);
			error = FAIL_MSG;
			loading = false;
		}
		// 성공하면 브라우저가 카카오로 이동한다 — 이후 코드는 실행되지 않는다.
	}
</script>

<svelte:head>
	<title>로그인 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto w-full max-w-[420px] pt-8">
	<section class="rounded-card border-2 border-line bg-surface p-[26px] shadow-hs">
		<div class="pt-1 pb-3.5 text-center">
			<h3 class="m-0 inline-flex items-center gap-1 text-[16px] font-bold">
				<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" class="shrink-0"><path fill="#191919" d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5 4.5 6.4l-1 3.6c-.1.3.3.6.5.4l4.3-2.9c.6.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.6S17.5 3 12 3z" /></svg>
				카카오계정으로 로그인
			</h3>
			<p class="mt-1 text-[12px] font-normal text-mute">셀러리 고객 로그인은 카카오만 지원해요</p>
		</div>

		<button
			type="button"
			onclick={signInWithKakao}
			disabled={loading}
			class="inline-flex w-full items-center justify-center gap-1.5 rounded border-2 border-line bg-kakao px-4 py-3 font-mono text-[15px] font-bold text-kakao-ink shadow-hs-sm hover:bg-kakao-hover disabled:cursor-wait disabled:opacity-45"
		>
			<KakaoIcon class="shrink-0" />
			{loading ? '카카오로 이동 중…' : '카카오 로그인'}
		</button>

		{#if error}
			<p role="alert" class="mt-3 border-[1.5px] border-danger bg-danger-soft px-3.5 py-2.5 text-center text-[12.5px] text-danger">{error}</p>
		{/if}

		<p class="mt-1.5 text-center text-[11.5px] leading-normal text-mute">로그인하면 오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력을 쓸 수 있어요</p>
		<p class="mt-2 text-center text-[11.5px] leading-normal text-mute">
			로그인하면 <a href="/terms" class="underline underline-offset-2">이용약관</a>과 <a href="/privacy" class="underline underline-offset-2">개인정보처리방침</a>에 동의한 것으로 봅니다
		</p>
	</section>

	{#if data.devLogin}
		<DevLoginForm next={data.next} />
	{/if}
</div>
