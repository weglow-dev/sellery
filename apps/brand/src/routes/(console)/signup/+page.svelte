<script lang="ts">
	/**
	 * 브랜드 입점 신청 폼 — apps/influencer `(console)/signup/+page.svelte` 의 브랜드 판 (프로토타입 login.html 브랜드 가입 분기 + 0001 brands 열, docs/brand-console-plan.md §3).
	 * 검증은 `brand/signup-rules` 와 동일(서버 `parseBrandSignupMeta` · 0014 함수가 다시 검사). signUp 의 `options.data` 에 `partner_role:'brand'` 와 가입 메타를 실어 두면
	 * `/brand/auth/confirm` 이 그 값으로 `brands` 행을 만든다(인증 즉시 입장 — 수동 심사 없음 · 사업자 확인은 상품 검수 게이트).
	 * `emailRedirectTo` = 현재 오리진 + `/brand/auth/confirm?next=/brand/home` — 프로덕션은 sellery.life 리라이트, Preview 는 자기 오리진.
	 *   - Confirm email ON(기본): 세션 없이 user 만 돌아온다 → /verify-sent. `identities` 가 빈 배열이면 이미 가입된 이메일 → 로그인·재설정 안내.
	 *   - Confirm email OFF: 세션이 곧바로 생긴다 → /apply 가 행을 만들고 /home 으로 보낸다.
	 */
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { consolePath } from '@sellery/db/console-paths';
	import { cleanText } from '@sellery/db/text';
	import {
		BIZ_NO_RE,
		BRAND_CATEGORIES,
		BRAND_NAME_MAX,
		BRAND_SIGNUP_FIELD_MESSAGES,
		EMAIL_RE,
		MANAGER_NAME_MAX,
		PASSWORD_RE,
		normalizeBizNo,
		normalizePhone,
		normalizeReferralInput,
		type BrandCategory
	} from '@sellery/db/brand/signup-rules';
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

	const nextPath = consolePath('brand', '/home');
	const applyPath = consolePath('brand', '/apply');
	const verifySentPath = consolePath('brand', '/verify-sent');

	let company = $state('');
	let bizNo = $state('');
	let manager = $state('');
	let phone = $state('');
	let category = $state<BrandCategory>('건강기능식품');
	let email = $state('');
	let password = $state('');
	let referral = $state('');
	let agree = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const nm = cleanText(company);
		const biz = bizNo.trim();
		const mg = cleanText(manager);
		const ph = normalizePhone(phone);
		const em = email.trim().toLowerCase();
		if (!nm || nm.length > BRAND_NAME_MAX) return void (error = BRAND_SIGNUP_FIELD_MESSAGES.name);
		if (!BIZ_NO_RE.test(biz) || !normalizeBizNo(biz)) return void (error = BRAND_SIGNUP_FIELD_MESSAGES.biz_no);
		if (!mg || mg.length > MANAGER_NAME_MAX) return void (error = BRAND_SIGNUP_FIELD_MESSAGES.manager_name);
		if (!ph) return void (error = BRAND_SIGNUP_FIELD_MESSAGES.manager_phone);
		if (!EMAIL_RE.test(em)) return void (error = '이메일 형식을 확인해주세요.');
		if (!PASSWORD_RE.test(password)) return void (error = '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.');
		if (!agree) return void (error = BRAND_SIGNUP_FIELD_MESSAGES.terms);

		busy = true;
		error = null;
		const supabase = createBrowserSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const referralCode = normalizeReferralInput(referral);
		const { data: res, error: e2 } = await supabase.auth.signUp({
			email: em,
			password,
			options: {
				emailRedirectTo: `${window.location.origin}${consolePath('brand', '/auth/confirm')}?next=${encodeURIComponent(nextPath)}`,
				data: {
					partner_role: 'brand',
					company_name: nm,
					biz_no: normalizeBizNo(biz),
					manager_name: mg,
					manager_phone: ph,
					category,
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
	<title>브랜드 입점 신청 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">브랜드 입점 신청</h2>
		<p class="meta">담당자 이메일 인증을 완료하면 바로 브랜드 콘솔에 들어갈 수 있어요. 등록한 상품은 셀러리 운영팀 검수(영업일 1~2일) 뒤 인플루언서에게 공개됩니다. 인증 메일의 링크는 다른 기기에서 열어도 됩니다.</p>
		<form onsubmit={onSubmit} novalidate>
			<div class="fld">
				<label for="company">상호 (브랜드명)</label>
				<input id="company" name="company" placeholder="예: 바인허브" maxlength={BRAND_NAME_MAX} autocomplete="organization" required bind:value={company} />
			</div>
			<div class="fld">
				<label for="biz_no">사업자등록번호</label>
				<input id="biz_no" name="biz_no" inputmode="numeric" placeholder="000-00-00000" maxlength={12} autocomplete="off" required bind:value={bizNo} />
				<div class="hint">숫자 10자리 — 하이픈은 있어도 없어도 돼요. 정산 · 세금계산서에 쓰이며, 사업자등록증은 정산 정보에서 올립니다.</div>
			</div>
			<div class="fld">
				<label for="manager">담당자 이름</label>
				<input id="manager" name="manager" placeholder="예: 김바인" maxlength={MANAGER_NAME_MAX} autocomplete="name" required bind:value={manager} />
			</div>
			<div class="fld">
				<label for="phone">담당자 연락처</label>
				<input id="phone" name="phone" type="tel" inputmode="tel" placeholder="010-1234-5678" maxlength={13} autocomplete="tel" required bind:value={phone} />
			</div>
			<div class="fld">
				<label for="category">카테고리</label>
				<select id="category" name="category" bind:value={category}>
					{#each BRAND_CATEGORIES as c (c)}
						<option value={c}>{c}</option>
					{/each}
				</select>
				<div class="hint">셀러리는 건강·웰니스 상품만 취급해요. 상품별 세부 카테고리는 상품 등록에서 고릅니다.</div>
			</div>
			<div class="fld">
				<label for="email">담당자 이메일</label>
				<input id="email" type="email" name="email" autocomplete="email" inputmode="email" placeholder="name@company.com" required bind:value={email} />
			</div>
			<div class="fld">
				<label for="password">비밀번호</label>
				<input id="password" type="password" name="password" autocomplete="new-password" placeholder="8자 이상, 영문+숫자" required bind:value={password} />
			</div>
			<div class="fld">
				<label for="referral">추천 브랜드 코드 <span style="font-weight:400;text-transform:none;letter-spacing:0">(선택)</span></label>
				<input id="referral" name="referral" autocomplete="off" placeholder="예: VYNE-01 — 첫 3회 판매 플랫폼 수수료 −1%p" style="text-transform:uppercase" maxlength={20} bind:value={referral} />
			</div>
			<label class="console-check">
				<input type="checkbox" name="agree" bind:checked={agree} />
				<span>
					<a href={data.termsUrl} target="_blank" rel="noopener noreferrer">이용약관</a>·<a href={data.privacyUrl} target="_blank" rel="noopener noreferrer">개인정보처리방침</a>에 동의합니다. 셀러리는 건강·웰니스 상품만 취급하며, 플랫폼 밖 직거래는 정산·분쟁 보호를 받지 못합니다.
				</span>
			</label>
			<p class="console-err" role="alert">{error ?? ''}</p>
			<button type="submit" class="pri" disabled={busy} style="width:100%">{busy ? '처리 중…' : '신청하고 인증 메일 받기 →'}</button>
		</form>
		<div class="foot">
			<span>이미 계정이 있나요?</span>
			<a href={consolePath('brand', '/login')}>로그인</a>
		</div>
	</section>
</div>
