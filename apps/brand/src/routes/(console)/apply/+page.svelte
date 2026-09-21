<script lang="ts">
	/**
	 * 보완 폼 — apps/influencer `(console)/apply/+page.svelte` 의 브랜드 판. 가입 폼과 같은 필드(상호 · 사업자번호 · 담당자 · 연락처 · 카테고리 · 추천 코드)를 user_metadata 로 프리필.
	 * 약관 동의가 메타에 없으면 체크박스를 다시 받는다. 제출은 form action(default, `use:enhance`) — 실패 문구는 `form.error`.
	 * `NO_FORM` 코드(LINK_TARGET_* · NOT_CONFIRMED · EMAIL_TAKEN)는 안내만. 로그아웃은 콘솔 전용 auth/signout.
	 */
	import { enhance } from '$app/forms';
	import { consolePath } from '@sellery/db/console-paths';
	import { BRAND_CATEGORIES, BRAND_NAME_MAX, MANAGER_NAME_MAX } from '@sellery/db/brand/signup-rules';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let pending = $state(false);
	const signoutAction = `${consolePath('brand', '/auth/signout')}?next=${encodeURIComponent(consolePath('brand', '/login'))}`;
</script>

<svelte:head>
	<title>입점 정보 확인 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">입점 정보를 확인해주세요</h2>
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
					<label for="name">상호 (브랜드명)</label>
					<input id="name" name="name" value={data.defaults.name} maxlength={BRAND_NAME_MAX} required placeholder="예: 바인허브" />
				</div>
				<div class="fld">
					<label for="biz_no">사업자등록번호</label>
					<input id="biz_no" name="biz_no" value={data.defaults.bizNo} inputmode="numeric" maxlength={12} autocomplete="off" placeholder="000-00-00000" required />
					<div class="hint">숫자 10자리. 이미 다른 계정이 쓰는 사업자번호는 등록할 수 없어요.</div>
				</div>
				<div class="fld">
					<label for="manager_name">담당자 이름</label>
					<input id="manager_name" name="manager_name" value={data.defaults.managerName} maxlength={MANAGER_NAME_MAX} required placeholder="예: 김바인" />
				</div>
				<div class="fld">
					<label for="manager_phone">담당자 연락처</label>
					<input id="manager_phone" name="manager_phone" type="tel" value={data.defaults.managerPhone} inputmode="tel" maxlength={13} required placeholder="010-1234-5678" />
				</div>
				<div class="fld">
					<label for="category">카테고리</label>
					<select id="category" name="category" value={data.defaults.category}>
						{#each BRAND_CATEGORIES as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				<div class="fld">
					<label for="referral_code">추천 브랜드 코드 <span style="font-weight:400;text-transform:none;letter-spacing:0">(선택)</span></label>
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
