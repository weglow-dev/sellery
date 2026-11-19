<script lang="ts">
	import { ACCOUNT_MAX, digitsOnly, formatBizNo, type SettleField, type SettleInfo, type SettleValues } from '@sellery/myr-core/settle-info';
	import { formatPhone } from '@sellery/myr-core/phone';
	import CheckBox from './auth/CheckBox.svelte';
	import { AUTH_HINT, AUTH_LABEL, authInput } from '$lib/auth-ui';
	import BankSelect from './BankSelect.svelte';

	/**
	 * 사업자 · 정산 정보 칸(9번 · 0085) — 내 정보(SettleInfoForm)와 초대 가입 폼(한 폼 · 선택 칸)이 같이 쓴다.
	 * 값은 부모가 들고(bind:values) 오류 문구도 부모가 준다(show). named = 가입 form action 으로 보낼 때 name 을 붙인다(settle_*).
	 * 저장된 사업자번호 · 계좌는 info 의 가린 값을 자리 표시로 — 비워 두면 그대로.
	 * 대표자 휴대폰(0121) — 토스페이먼츠 지급대행 본인인증 문자를 받는 번호. contactPhone 을 주면(가입 폼) "연락처와 같아요"(same)로 칸을 접는다 — 그때 보내는 값은 연락처.
	 */
	let {
		values = $bindable(),
		info = null,
		show,
		clear,
		named = false,
		heading = 'text-[15px] font-extrabold lg:text-[16px]',
		contactPhone = null,
		same = $bindable(false)
	}: { values: SettleValues; info?: SettleInfo | null; show: (k: SettleField) => string | undefined; clear: (k: SettleField) => void; named?: boolean; heading?: string; contactPhone?: string | null; same?: boolean } = $props();

	const sameOn = $derived(contactPhone !== null && same);
</script>

{#snippet err(k: SettleField)}
	{#if show(k)}<p class="text-[12.5px] font-semibold text-accent" role="alert">{show(k)}</p>{/if}
{/snippet}

	<fieldset class="flex flex-col gap-4">
		<legend class="mb-3 {heading}">사업자 정보</legend>
		<div class="flex flex-col gap-2">
			<label for="s-company" class={AUTH_LABEL}>상호</label>
			<input id="s-company" name={named ? "settle_company" : undefined} autocomplete="organization" placeholder="예: 민지랩" maxlength="50" bind:value={values.company} oninput={() => clear('company')} class={authInput({ size: 'md', invalid: !!show('company'), filled: !!values.company })} />
			{@render err('company')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-bizNo" class={AUTH_LABEL}>사업자등록번호</label>
			<input
				id="s-bizNo" name={named ? "settle_bizNo" : undefined}
				inputmode="numeric"
				autocomplete="off"
				placeholder={info?.bizNoMasked ? `${info.bizNoMasked}` : '123-45-67890'}
				value={values.bizNo}
				oninput={(e) => {
					values.bizNo = formatBizNo(e.currentTarget.value);
					e.currentTarget.value = values.bizNo;
					clear('bizNo');
				}}
				class={authInput({ size: 'md', invalid: !!show('bizNo'), filled: !!values.bizNo })}
			/>
			{@render err('bizNo')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-ceo" class={AUTH_LABEL}>대표자</label>
			<input id="s-ceo" name={named ? "settle_ceo" : undefined} autocomplete="name" placeholder="사업자등록증의 대표자 이름" maxlength="30" bind:value={values.ceo} oninput={() => clear('ceo')} class={authInput({ size: 'md', invalid: !!show('ceo'), filled: !!values.ceo })} />
			{@render err('ceo')}
		</div>
		<div class="flex flex-col gap-2">
			{#if sameOn}<span class={AUTH_LABEL}>대표자 휴대폰</span>{:else}<label for="s-ceoPhone" class={AUTH_LABEL}>대표자 휴대폰</label>{/if}
			{#if contactPhone !== null}
				<CheckBox size={22} bind:checked={same} onchange={() => clear('ceoPhone')}><span class="text-[13.5px] text-white/80">03 연락처와 같아요{#if contactPhone}<span class="ml-1 text-white/50 tabular-nums">· {contactPhone}</span>{/if}</span></CheckBox>
			{/if}
			{#if sameOn}
				<input type="hidden" name={named ? 'settle_ceoPhone' : undefined} value={contactPhone ?? ''} />
			{:else}
				<input
					id="s-ceoPhone" name={named ? 'settle_ceoPhone' : undefined}
					type="tel"
					inputmode="numeric"
					autocomplete="tel"
					placeholder="010-0000-0000"
					maxlength="13"
					value={values.ceoPhone}
					oninput={(e) => {
						values.ceoPhone = formatPhone(e.currentTarget.value);
						e.currentTarget.value = values.ceoPhone;
						clear('ceoPhone');
					}}
					class="{authInput({ size: 'md', invalid: !!show('ceoPhone'), filled: !!values.ceoPhone })} tabular-nums"
				/>
				{@render err('ceoPhone')}
			{/if}
			{#if !show('ceoPhone') || sameOn}<p class={AUTH_HINT}>토스페이먼츠가 이 번호로 지급대행 본인인증 문자를 보내요 · 대표자 본인 명의 번호여야 해요</p>{/if}
		</div>
		<div class="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
			<span class="text-[12.5px] text-white/55">세금계산서 받는 이메일</span>
			<span class="text-[14px] font-bold break-all">{info?.taxEmail || '초대받은 이메일'}</span>
			<span class={AUTH_HINT}>정산금 세금계산서는 이 이메일로 받아요(초대받은 이메일 · 바꾸려면 MYR 파트너팀에 연락해 주세요)</span>
		</div>
	</fieldset>

	<fieldset class="flex flex-col gap-4">
		<legend class="mb-3 {heading}">정산 계좌</legend>
		<div class="flex flex-col gap-2">
			<label for="s-bank" class={AUTH_LABEL}>은행</label>
			<BankSelect id="s-bank" name={named ? 'settle_bank' : undefined} bind:value={values.bank} invalid={!!show('bank')} onchange={() => clear('bank')} />
			{@render err('bank')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-account" class={AUTH_LABEL}>계좌번호</label>
			<input
				id="s-account" name={named ? "settle_account" : undefined}
				inputmode="numeric"
				autocomplete="off"
				placeholder={info?.accountMasked ? `${info.accountMasked}` : '숫자만 입력'}
				value={values.account}
				oninput={(e) => {
					values.account = digitsOnly(e.currentTarget.value).slice(0, ACCOUNT_MAX);
					e.currentTarget.value = values.account;
					clear('account');
				}}
				class={authInput({ size: 'md', invalid: !!show('account'), filled: !!values.account })}
			/>
			{@render err('account')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-holder" class={AUTH_LABEL}>예금주</label>
			<input id="s-holder" name={named ? "settle_holder" : undefined} autocomplete="off" placeholder="상호 또는 대표자 이름" maxlength="50" bind:value={values.holder} oninput={() => clear('holder')} class={authInput({ size: 'md', invalid: !!show('holder'), filled: !!values.holder })} />
			{#if show('holder')}{@render err('holder')}{:else}<p class={AUTH_HINT}>사업자 계좌(예금주 = 상호) 또는 대표자 본인 명의 개인 계좌만 받아요</p>{/if}
		</div>
	</fieldset>

