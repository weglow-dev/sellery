<script lang="ts">
	/**
	 * 보완 폼 — web influencer/apply/apply-form.tsx 1:1. 가입 폼과 같은 필드(활동명 · 플랫폼 · 핸들 · 추천 코드)를 user_metadata 로 프리필.
	 * 약관 동의가 메타에 없으면 체크박스를 다시 받는다. 제출은 form action(default, `use:enhance`) — 실패 문구는 `form.error`(useActionState 대체).
	 * `NO_FORM` 코드(LINK_TARGET_NOT_FOUND · LINK_TARGET_TAKEN · NOT_CONFIRMED)는 안내만. 로그아웃은 콘솔 전용 auth/signout(결정 15).
	 */
	import { enhance } from '$app/forms';
	import { consolePath } from '@sellery/db/console-paths';
	import { NAME_MAX, PLATFORMS, PLATFORM_LABELS } from '@sellery/db/partner/signup-rules';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let pending = $state(false);
	const signoutAction = `${consolePath('seller', '/auth/signout')}?next=${encodeURIComponent(consolePath('seller', '/login'))}`;
</script>

<svelte:head>
	<title>가입 정보 확인 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">인플루언서 콘솔</div>
		<h2 class="console-title">가입 정보를 확인해주세요</h2>
		<p class="notice danger" role="alert">{data.message}</p>
		{#if data.noForm}
			<p class="meta">이 문제는 화면에서 바로 고칠 수 없어요. 가입한 이메일과 함께 <a href={data.company.csUrl}>{data.company.email}</a> 로 알려주시면 확인해 드릴게요.</p>
		{:else}
			<p class="meta">아래 정보만 확인하면 바로 콘솔에 들어갈 수 있어요. 이메일 인증은 이미 끝났습니다.</p>
			<form
				method="post"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						pending = false;
						await update();
					};
				}}
			>
				<div class="fld">
					<label for="name">활동명</label>
					<input id="name" name="name" value={data.defaults.name} maxlength={NAME_MAX} required placeholder="예: 지유" />
				</div>
				<div class="fld">
					<label for="platform">메인 SNS 플랫폼</label>
					<select id="platform" name="platform" value={data.defaults.platform}>
						{#each PLATFORMS as p (p)}
							<option value={p}>{PLATFORM_LABELS[p]}</option>
						{/each}
					</select>
				</div>
				<div class="fld">
					<label for="handle">계정 핸들</label>
					<input id="handle" name="handle" value={data.defaults.handle} autocapitalize="none" autocomplete="off" placeholder="@my_account" maxlength={31} pattern="@?[A-Za-z0-9._]{'{'}2,30{'}'}" required />
					<div class="hint">영문·숫자·점(.)·밑줄(_) 2~30자. 이미 쓰이는 핸들은 등록할 수 없어요.</div>
				</div>
				<div class="fld">
					<label for="referral_code">추천 코드 <span style="font-weight:400;text-transform:none;letter-spacing:0">(선택)</span></label>
					<input id="referral_code" name="referral_code" value={data.defaults.referralCode} autocomplete="off" maxlength={20} style="text-transform:uppercase" />
				</div>
				{#if !data.defaults.termsAgreed}
					<label class="console-check">
						<input type="checkbox" name="terms" required />
						<span>
							<a href={data.termsUrl} target="_blank" rel="noopener noreferrer">이용약관</a>·<a href={data.privacyUrl} target="_blank" rel="noopener noreferrer">개인정보처리방침</a>에 동의합니다.
						</span>
					</label>
				{/if}
				<p class="console-err" role="alert">{form?.error ?? ''}</p>
				<button type="submit" class="pri" disabled={pending} style="width:100%">{pending ? '저장 중…' : '확인하고 콘솔 들어가기 →'}</button>
			</form>
		{/if}
		<div class="foot">
			<span>{data.email}</span>
			<form method="post" action={signoutAction}>
				<button type="submit" class="ghost sm">로그아웃</button>
			</form>
		</div>
	</section>
</div>
