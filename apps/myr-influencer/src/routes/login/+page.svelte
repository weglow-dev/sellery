<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { LOGIN_QUOTE, loginStats, MYR_APPLY_URL } from '$lib/auth-copy';
	import { AUTH_LABEL, authButton, authInput } from '$lib/auth-ui';
	import { EMAIL_RE, loginFieldErrors } from '$lib/console-auth';
	import AuthLogo from '$lib/components/auth/AuthLogo.svelte';
	import AuthToast from '$lib/components/auth/AuthToast.svelte';
	import CheckBox from '$lib/components/auth/CheckBox.svelte';
	import ErrorText from '$lib/components/auth/ErrorText.svelte';
	import PasswordToggle from '$lib/components/auth/PasswordToggle.svelte';

	/**
	 * 로그인 — 시안 "MYR Influencer Login"(모바일) · "… PC". 같은 마크업을 lg(1024px~)에서 왼쪽 소개 + 오른쪽 카드로 나눈다.
	 * 칸 검증은 시안처럼 칸을 떠날 때(blur) 또는 제출을 시도했을 때 보여준다 — 규칙은 lib/console-auth.ts(서버와 같은 문구).
	 * 칸이 다 맞지 않으면 버튼이 회색이고, 눌러도 전송하지 않고 빠진 칸을 보여준다. 처리는 +page.server.ts(로그인 · 비밀번호 찾기).
	 */
	let { data, form } = $props();

	// 서버가 돌려준 값으로 한 번만 채운다(이후는 사용자가 고친다)
	let email = $state(untrack(() => form?.email ?? ''));
	let password = $state('');
	let remember = $state(untrack(() => form?.remember ?? true));
	let showPw = $state(false);
	let touched = $state({ email: false, password: false });
	let attempted = $state(false);
	let busy = $state(false);
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	const errs = $derived(loginFieldErrors(email, password));
	const canSubmit = $derived(!errs.email && !errs.password);
	const showEmailErr = $derived((touched.email || attempted) && !!errs.email);
	const showPwErr = $derived((touched.password || attempted) && !!errs.password);
	/** 서버가 돌려준 오류(자격 증명 불일치 등) — 칸 오류가 없을 때 버튼 위에 */
	/** 비밀번호 찾기 거절(크리에이터가 아닌 이메일 · 정지 · 요청 과다) — 이메일 칸 아래에, 이메일을 고치면 사라진다 */
	const forgotError = $derived(form && form.action === 'forgot' && 'message' in form && form.message && form.email === email.trim().toLowerCase() ? form.message : null);
	const serverMessage = $derived(form && 'message' in form && form.action === 'login' && !form.field ? form.message : null);
	const notice = $derived(data.reset ? '비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요.' : null);

	function showToast(msg: string) {
		clearTimeout(toastTimer);
		toast = msg;
		toastTimer = setTimeout(() => (toast = null), 2600);
	}

	let formEl: HTMLFormElement | undefined = $state();
	let forgotSubmit: HTMLButtonElement | undefined = $state();

	/** 비밀번호 찾기 — 이메일이 맞지 않으면 보내지 않고 안내(시안 forgot).
	 *  눈에 보이는 버튼은 type="button" — 칸에서 Enter 를 누르면 브라우저가 폼의 **첫 번째 제출 버튼**을 누르는데, 이 버튼이 로그인 버튼보다 앞에 있어
	 *  Enter 가 재설정 메일을 보내던 문제(2026-11-05)를 막는다. 실제 제출은 로그인 버튼 뒤에 둔 숨은 제출 버튼으로(`?/forgot`). */
	function onForgot() {
		if (!EMAIL_RE.test(email.trim())) {
			// 안내는 이메일 칸 아래(errs.email)에만 — 토스트는 보낸 경우에만(2026-11-05)
			touched.email = true;
			attempted = true;
			return;
		}
		formEl?.requestSubmit(forgotSubmit);
	}
</script>

<svelte:head><title>로그인 — MYR Creator</title></svelte:head>

<div class="relative min-h-dvh overflow-hidden bg-bg">
	<!-- 배경 빛 — 모바일은 왼쪽 위 하나, PC 는 위쪽 주황 + 왼쪽 아래 라일락 -->
	<div class="pointer-events-none absolute -top-40 -left-[120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.28),rgba(10,11,14,0))] lg:-top-[260px] lg:left-[18%] lg:h-[720px] lg:w-[720px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,.26),rgba(10,11,14,0))]"></div>
	<div class="pointer-events-none absolute -bottom-[300px] -left-[220px] hidden h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(184,196,245,.1),rgba(10,11,14,0))] lg:block"></div>

	<div class="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-8 lg:max-w-[1200px] lg:px-10 lg:pb-12">
		<header class="flex h-16 shrink-0 items-center lg:h-auto lg:pt-9"><AuthLogo large /></header>

		<div class="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_480px] lg:items-center lg:gap-20 lg:py-8">
			<!-- PC 왼쪽: 소개 · 숫자 · 후기 (⚠ 숫자와 후기는 시안 문구 — lib/auth-copy.ts) -->
			<section class="hidden max-w-[560px] min-w-0 lg:block" aria-label="MYR 크리에이터 스튜디오 소개">
				<p class="text-[14px] font-bold tracking-[0.02em] text-accent">크리에이터 스튜디오</p>
				<h2 class="mt-3.5 text-[46px] leading-[1.18] font-extrabold tracking-[-0.035em] text-balance">내 레시피로 만든 제품,<br />팔로워에게 바로 판매하세요</h2>
				<p class="mt-[18px] text-[16px] leading-[1.65] text-white/62">제조 의뢰부터 정산까지 MYR이 대신 처리해요.<br />크리에이터는 레시피와 팔로워에게만 집중하면 돼요.</p>
				<div class="mt-9 grid grid-cols-3 gap-3">
					{#each loginStats(data.settlePct) as s (s.label)}
						<div class="rounded-[20px] border border-white/8 bg-white/4 p-[18px]">
							<p class="text-[26px] font-extrabold tracking-[-0.04em] tabular-nums">{s.big}</p>
							<p class="mt-1.5 text-[12px] leading-[1.5] whitespace-pre-line text-white/55">{s.label}</p>
						</div>
					{/each}
				</div>
				<div class="mt-[52px] flex items-center gap-3.5 rounded-[20px] border border-white/7 bg-white/3 px-[18px] py-4">
					<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-bg" style:background={LOGIN_QUOTE.bg} aria-hidden="true">{LOGIN_QUOTE.initial}</span>
					<figure class="min-w-0 flex-1">
						<blockquote class="text-[14px] leading-[1.55] text-white/85">{LOGIN_QUOTE.text}</blockquote>
						<figcaption class="mt-1.5 text-[12px] text-white/50">{LOGIN_QUOTE.who}</figcaption>
					</figure>
				</div>
			</section>

			<!-- 로그인 — 모바일은 그대로 · PC 는 카드 -->
			<section class="animate-up-in lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-10 lg:shadow-[0_30px_80px_rgba(0,0,0,.35)]">
				<p class="mt-10 text-[13px] font-bold text-accent lg:hidden">크리에이터 스튜디오</p>
				<h1 class="mt-2 text-[30px] leading-[1.25] font-extrabold tracking-[-0.03em] text-balance lg:mt-0">다시 만나서 반가워요</h1>
				<p class="mt-3 text-[15px] leading-[1.6] text-white/60 lg:mt-2.5">가입할 때 쓴 이메일로 로그인하세요.<br class="lg:hidden" /> 오늘 들어온 주문과 CS를 바로 확인할 수 있어요.</p>

				{#if notice}
					<p class="mt-6 rounded-2xl border border-mint/30 bg-mint/10 px-4 py-3 text-[13px] leading-[1.55] text-mint" role="status">{notice}</p>
				{/if}
				{#if data.linkError}
					<p class="mt-6 rounded-2xl border border-accent/30 bg-accent/8 px-4 py-3 text-[13px] leading-[1.55] text-[#ffb08a]" role="alert">{data.linkError}</p>
				{/if}

				<form
					bind:this={formEl}
					method="POST"
					action="?/login"
					novalidate
					class="mt-8 flex flex-col gap-4 lg:mt-7"
					onsubmit={(e) => {
						const forgot = (e.submitter as HTMLButtonElement | null)?.formAction?.includes('/forgot');
						if (!forgot && !canSubmit) {
							e.preventDefault();
							attempted = true;
						}
					}}
					use:enhance={({ action }) => {
						busy = true;
						const isForgot = action.search.includes('/forgot');
						return async ({ result, update }) => {
							busy = false;
							if (isForgot && result.type === 'success') {
								showToast(`${email.trim()} 로 재설정 링크를 보냈어요`);
								return;
							}
							await update({ reset: false });
							// 거절(크리에이터가 아닌 이메일 · 정지 · 요청 과다)은 이메일 칸 아래 forgotError 로만 — 토스트 없음
						};
					}}
				>
					<input type="hidden" name="next" value={data.next} />
					<div class="flex flex-col gap-2">
						<label for="email" class={AUTH_LABEL}>이메일</label>
						<input
							id="email"
							name="email"
							type="email"
							inputmode="email"
							autocomplete="email"
							autocapitalize="none"
							spellcheck="false"
							placeholder="creator@myr.kr"
							bind:value={email}
							onblur={() => (touched.email = true)}
							aria-invalid={showEmailErr}
							aria-describedby={showEmailErr ? 'email-err' : undefined}
							class={authInput({ invalid: showEmailErr, filled: !!email.trim() })}
						/>
						{#if showEmailErr}<ErrorText id="email-err" text={errs.email} />{:else if forgotError}<ErrorText id="email-err" text={forgotError} />{/if}
					</div>

					<div class="flex flex-col gap-2">
						<div class="flex items-baseline justify-between">
							<label for="password" class={AUTH_LABEL}>비밀번호</label>
							<button type="button" onclick={onForgot} class="text-[12px] font-semibold text-white/50 transition-colors hover:text-accent">비밀번호를 잊으셨나요?</button>
						</div>
						<div class="relative">
							<input
								id="password"
								name="password"
								type={showPw ? 'text' : 'password'}
								autocomplete="current-password"
								placeholder="8자 이상"
								bind:value={password}
								onblur={() => (touched.password = true)}
								aria-invalid={showPwErr}
								aria-describedby={showPwErr ? 'password-err' : undefined}
								class={authInput({ invalid: showPwErr, filled: !!password, padRight: true })}
							/>
							<PasswordToggle bind:shown={showPw} />
						</div>
						{#if showPwErr}<ErrorText id="password-err" text={errs.password} />{/if}
					</div>

					<CheckBox name="remember" bind:checked={remember}><span class="text-[14px] text-white/75">이 기기에서 로그인 유지</span></CheckBox>

					{#if serverMessage}<ErrorText text={serverMessage} />{/if}

					<button type="submit" disabled={busy} class="{authButton(canSubmit)} mt-2 lg:h-14" aria-disabled={!canSubmit}>
						{busy ? '로그인 중…' : '로그인'}
						{#if canSubmit && !busy}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{/if}
					</button>
					<!-- 비밀번호 찾기 실제 제출 — 로그인 버튼 **뒤**에 둬야 Enter 가 로그인으로 간다(위 onForgot 주석) -->
					<button bind:this={forgotSubmit} type="submit" formaction="?/forgot" formnovalidate hidden tabindex="-1" aria-hidden="true"></button>
				</form>

				<div class="mt-6 flex items-start gap-3 rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5">
					<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent/12 text-accent" aria-hidden="true">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
					</span>
					<p class="min-w-0 flex-1 text-[13px] leading-[1.55] text-white/60">
						<b class="block font-bold text-fg">크리에이터 가입은 초대로만 받아요</b>
						MYR 파트너팀이 보낸 초대 메일의 링크로 가입해주세요.<br />
						내 브랜드 제품이 처음이라면 <a href={MYR_APPLY_URL} class="font-bold text-accent underline underline-offset-2 hover:text-[#ffa06f]">제조 의뢰 알아보기</a>
					</p>
				</div>

				<!-- 약관 문서가 확정되면 이용약관 · 개인정보 처리방침에 링크를 붙인다 -->
				<p class="mt-7 text-center text-[11px] leading-[1.6] text-white/35">로그인하면 MYR 크리에이터 이용약관과 개인정보 처리방침에 동의하는 것으로 봐요.</p>
			</section>
		</div>
	</div>

	<AuthToast message={toast} />
</div>
