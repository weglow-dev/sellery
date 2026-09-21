<script lang="ts">
	/**
	 * 인증 메일 안내 + [메일 다시 보내기] — apps/influencer `(console)/verify-sent/+page.svelte` 의 브랜드 판.
	 * `supabase.auth.resend({ type:'signup' })` · 60초 쿨다운(Supabase 도 같은 주소로 60초에 1회만 보낸다). 존재하지 않는 이메일이어도 결과를 구분해 보여 주지 않는다.
	 * `emailRedirectTo` 는 가입 폼과 같은 콘솔 전용 `/brand/auth/confirm?next=/brand/home`.
	 */
	import { onDestroy } from 'svelte';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { consolePath } from '@sellery/db/console-paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const COOLDOWN_S = 60;
	let left = $state(0);
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let timer: ReturnType<typeof setInterval> | undefined;

	function startCooldown() {
		left = COOLDOWN_S;
		clearInterval(timer);
		timer = setInterval(() => {
			left -= 1;
			if (left <= 0) clearInterval(timer);
		}, 1000);
	}
	onDestroy(() => clearInterval(timer));

	async function resend() {
		if (busy || left > 0 || !data.email) return;
		busy = true;
		msg = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { error } = await supabase.auth.resend({
			type: 'signup',
			email: data.email,
			options: { emailRedirectTo: `${window.location.origin}${consolePath('brand', '/auth/confirm')}?next=${encodeURIComponent(consolePath('brand', '/home'))}` }
		});
		busy = false;
		startCooldown();
		if (error && (error.code === 'over_email_send_rate_limit' || /rate limit/i.test(error.message))) {
			msg = '메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.';
			return;
		}
		msg = '다시 보냈어요 ✓ 가입된 이메일이라면 잠시 후 도착합니다.';
	}
</script>

<svelte:head>
	<title>인증 메일 안내 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">인증 메일을 보냈어요 ✉</h2>
		<p class="meta">
			{#if data.email}<b>{data.email}</b> 로 인증 링크를 보냈습니다.{:else}입력한 담당자 이메일로 인증 링크를 보냈습니다.{/if}
			메일의 버튼을 누르면 입점 신청이 완료되고 바로 브랜드 콘솔에 들어갈 수 있어요. 링크는 다른 기기(휴대폰 메일 앱)에서 열어도 됩니다.
		</p>
		<p class="meta" style="margin-top:8px">메일이 보이지 않으면 스팸함을 확인해주세요. 발신 주소는 <b>no-reply@sellery.life</b> 입니다.</p>
		{#if data.email}
			<div style="margin-top:14px">
				<button type="button" class="ghost sm" onclick={resend} disabled={busy || left > 0}>
					{busy ? '보내는 중…' : left > 0 ? `메일 다시 보내기 (${left}초)` : '메일 다시 보내기'}
				</button>
				{#if msg}<p class="console-ok" role="status">{msg}</p>{/if}
			</div>
		{/if}
		<div class="foot">
			<span>이미 인증을 마쳤나요?</span>
			<a href={consolePath('brand', '/login')}>로그인으로</a>
		</div>
	</section>
</div>
