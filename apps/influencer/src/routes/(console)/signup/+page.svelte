<script lang="ts">
	/**
	 * 가입 폼 — web (public)/signup/signup-form.tsx 1:1 (프로토타입 login.html fJoin + 플랫폼·핸들, docs/inf-console-plan.md §4.1).
	 * 검증은 `signup-rules` 와 동일(서버 `parseSignupMeta` 가 다시 검사). signUp 의 `options.data` 에 `partner_role:'seller'` 와 가입 메타를 실어 두면
	 * `/influencer/auth/confirm`(결정 15 — 콘솔 전용 사본) 이 그 값으로 `sellers` 행을 만든다.
	 * `emailRedirectTo` = 현재 오리진 + `/influencer/auth/confirm?next=/influencer/home` — 프로덕션은 sellery.life 리라이트, Preview 는 자기 오리진.
	 *   - Confirm email ON(기본): 세션 없이 user 만 돌아온다 → /verify-sent. `identities` 가 빈 배열이면 이미 가입된 이메일 → 로그인·재설정 안내.
	 *   - Confirm email OFF: 세션이 곧바로 생긴다 → /apply 가 행을 만들고 /home 으로 보낸다.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { consolePath } from '@sellery/db/console-paths';
	import { cleanText } from '@sellery/db/text';
	import {
		EMAIL_RE,
		HANDLE_RE,
		NAME_MAX,
		PASSWORD_RE,
		PLATFORMS,
		PLATFORM_LABELS,
		SIGNUP_FIELD_MESSAGES,
		normalizeHandleInput,
		normalizeReferralInput,
		type Platform
	} from '@sellery/db/partner/signup-rules';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const GENERIC = '가입 처리에 실패했어요. 잠시 후 다시 시도해주세요.';
	const ALREADY = '이미 가입된 이메일이에요 — 로그인하거나 비밀번호를 재설정해주세요.';
	function messageFor(code: string | undefined, message: string): string {
		if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(message)) return ALREADY;
		if (code === 'weak_password') return '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.';
		if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(message)) return '메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.';
		if (code === 'email_address_invalid' || /invalid.*email/i.test(message)) return '이메일 형식을 확인해주세요.';
		return GENERIC;
	}

	const nextPath = consolePath('seller', '/home');
	const applyPath = consolePath('seller', '/apply');
	const verifySentPath = consolePath('seller', '/verify-sent');

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let platform = $state<Platform>('instagram');
	let handle = $state('');
	let referral = $state('');
	let agree = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const nm = cleanText(name);
		const em = email.trim().toLowerCase();
		const hd = handle.trim();
		if (!nm || nm.length > NAME_MAX) return void (error = SIGNUP_FIELD_MESSAGES.name);
		if (!EMAIL_RE.test(em)) return void (error = '이메일 형식을 확인해주세요.');
		if (!PASSWORD_RE.test(password)) return void (error = '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.');
		if (!HANDLE_RE.test(hd)) return void (error = SIGNUP_FIELD_MESSAGES.handle);
		if (!agree) return void (error = SIGNUP_FIELD_MESSAGES.terms);

		busy = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const referralCode = normalizeReferralInput(referral);
		const { data: res, error: e2 } = await supabase.auth.signUp({
			email: em,
			password,
			options: {
				emailRedirectTo: `${window.location.origin}${consolePath('seller', '/auth/confirm')}?next=${encodeURIComponent(nextPath)}`,
				data: {
					partner_role: 'seller',
					display_name: nm,
					platform,
					handle: normalizeHandleInput(hd),
					...(referralCode ? { referral_code: referralCode } : {}),
					terms_agreed_at: new Date().toISOString()
				}
			}
		});
		if (e2) {
			error = messageFor(e2.code, e2.message);
			busy = false;
			return;
		}
		if (res.user && Array.isArray(res.user.identities) && res.user.identities.length === 0) {
			error = ALREADY;
			busy = false;
			return;
		}
		if (res.session) {
			// 인증 메일 없이 세션이 생긴 경우 — /apply 가 행을 만들고 /home 으로
			window.location.assign(applyPath);
			return;
		}
		window.location.assign(`${verifySentPath}?email=${encodeURIComponent(em)}`);
	}
</script>

<svelte:head>
	<title>인플루언서 가입 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">인플루언서 콘솔</div>
		<h2 class="console-title">인플루언서 가입</h2>
		<p class="meta">가입 후 이메일 인증을 완료하면 바로 콘솔에 들어갈 수 있어요. 인증 메일의 링크는 다른 기기에서 열어도 됩니다.</p>
		<form onsubmit={onSubmit} novalidate>
			<div class="fld">
				<label for="name">활동명</label>
				<input id="name" name="name" placeholder="예: 지유" maxlength={NAME_MAX} required bind:value={name} />
			</div>
			<div class="fld">
				<label for="email">이메일</label>
				<input id="email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required bind:value={email} />
			</div>
			<div class="fld">
				<label for="password">비밀번호</label>
				<input id="password" type="password" name="password" autocomplete="new-password" placeholder="8자 이상, 영문+숫자" required bind:value={password} />
			</div>
			<div class="fld">
				<label for="platform">메인 SNS 플랫폼</label>
				<select id="platform" name="platform" bind:value={platform}>
					{#each PLATFORMS as p (p)}
						<option value={p}>{PLATFORM_LABELS[p]}</option>
					{/each}
				</select>
			</div>
			<div class="fld">
				<label for="handle">계정 핸들</label>
				<input id="handle" name="handle" autocomplete="off" autocapitalize="none" placeholder="@my_account" maxlength={31} required bind:value={handle} />
				<div class="hint">영문·숫자·점(.)·밑줄(_) 2~30자. 판매 링크 주소와 첫 채널에 쓰여요 — 가입 뒤 마이페이지에서 인증합니다.</div>
			</div>
			<div class="fld">
				<label for="referral">추천 코드 <span style="font-weight:400;text-transform:none;letter-spacing:0">(선택)</span></label>
				<input id="referral" name="referral" autocomplete="off" placeholder="예: JIYU10 — 첫 5회 판매 수수료 +1%p" style="text-transform:uppercase" maxlength={20} bind:value={referral} />
			</div>
			<label class="console-check">
				<input type="checkbox" name="agree" bind:checked={agree} />
				<span>
					<a href={data.termsUrl} target="_blank" rel="noopener noreferrer">이용약관</a>·<a href={data.privacyUrl} target="_blank" rel="noopener noreferrer">개인정보처리방침</a>에 동의합니다. 셀러리는 건강·웰니스 상품만 취급하며, 플랫폼 밖 직거래는 정산·분쟁 보호를 받지 못합니다.
				</span>
			</label>
			<p class="console-err" role="alert">{error ?? ''}</p>
			<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? '처리 중…' : '가입하고 인증 메일 받기 →'}</button>
		</form>
		<div class="foot">
			<span>이미 계정이 있나요?</span>
			<a href={consolePath('seller', '/login')}>로그인</a>
		</div>
	</section>
</div>
