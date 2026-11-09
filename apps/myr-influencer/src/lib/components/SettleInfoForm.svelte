<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { BANKS, digitsOnly, formatBizNo, SETTLE_FIELDS, settleErrors, type SettleField, type SettleInfo, type SettleValues } from '@sellery/myr-core/settle-info';
	import { AUTH_HINT, AUTH_LABEL, authButton, authInput } from '$lib/auth-ui';

	/**
	 * 사업자 · 정산 정보 입력(9번 · 0085) — 초대 가입 2단계 · 내 정보 `/my` 공용. 저장은 POST /api/my/settle(서버가 같은 규칙으로 다시 막는다).
	 * 저장된 사업자번호 · 계좌는 가린 값만 보여 주고, 비워 두면 그대로 둔다(바꿀 때만 입력). 세금계산서 이메일은 초대 이메일(입력 없음).
	 * 칸 규칙 · 문구는 `@sellery/myr-core/settle-info`. 오류는 [저장]을 누른 뒤부터 보인다.
	 */
	let { info, submitLabel = '저장하기', onsaved, footer }: { info: SettleInfo | null; submitLabel?: string; onsaved?: (info: SettleInfo, recheck: boolean) => void; footer?: Snippet } = $props();

	let values = $state<SettleValues>(untrack(() => ({ company: info?.company ?? '', ceo: info?.ceo ?? '', bizNo: '', bank: info?.bank ?? '', account: '', holder: info?.holder ?? '' })));
	let attempted = $state(false);
	let busy = $state(false);
	let serverErr = $state<Partial<Record<SettleField, string>>>({});
	let formError = $state<string | null>(null);
	const saved = $derived({ hasBizNo: !!info?.hasBizNo, hasAccount: !!info?.hasAccount });
	const errs = $derived({ ...settleErrors(values, saved), ...serverErr });
	const show = (k: SettleField) => (attempted || serverErr[k] ? errs[k] : undefined);
	const clear = (k: SettleField) => {
		if (serverErr[k]) serverErr = { ...serverErr, [k]: undefined };
		formError = null;
	};

	async function save() {
		attempted = true;
		const bad = SETTLE_FIELDS.find((k) => !!errs[k]);
		if (bad) {
			document.getElementById(`s-${bad}`)?.focus();
			return;
		}
		busy = true;
		formError = null;
		try {
			const res = await fetch('/api/my/settle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...values, bizNo: digitsOnly(values.bizNo), account: digitsOnly(values.account) })
			});
			const r = (await res.json().catch(() => null)) as { ok?: boolean; recheck?: boolean; info?: SettleInfo; field?: SettleField; message?: string } | null;
			if (r?.ok && r.info) {
				values.bizNo = '';
				values.account = '';
				attempted = false;
				onsaved?.(r.info, r.recheck === true);
			} else if (r?.field) {
				serverErr = { ...serverErr, [r.field]: r.message };
				document.getElementById(`s-${r.field}`)?.focus();
			} else formError = r?.message ?? '저장하지 못했어요. 잠시 후 다시 시도해 주세요';
		} catch {
			formError = '저장하지 못했어요. 인터넷 연결을 확인해 주세요';
		} finally {
			busy = false;
		}
	}
</script>

{#snippet err(k: SettleField)}
	{#if show(k)}<p class="text-[12.5px] font-semibold text-accent" role="alert">{show(k)}</p>{/if}
{/snippet}

<form class="flex flex-col gap-5" onsubmit={(e) => (e.preventDefault(), save())} novalidate>
	<fieldset class="flex flex-col gap-4">
		<legend class="mb-3 text-[15px] font-extrabold lg:text-[16px]">사업자 정보</legend>
		<div class="flex flex-col gap-2">
			<label for="s-company" class={AUTH_LABEL}>상호</label>
			<input id="s-company" autocomplete="organization" placeholder="예: 민지랩" maxlength="50" bind:value={values.company} oninput={() => clear('company')} class={authInput({ size: 'md', invalid: !!show('company'), filled: !!values.company })} />
			{@render err('company')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-bizNo" class={AUTH_LABEL}>사업자등록번호</label>
			<input
				id="s-bizNo"
				inputmode="numeric"
				autocomplete="off"
				placeholder={info?.bizNoMasked ? `${info.bizNoMasked} · 바꿀 때만 입력` : '123-45-67890'}
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
			<input id="s-ceo" autocomplete="name" placeholder="사업자등록증의 대표자 이름" maxlength="30" bind:value={values.ceo} oninput={() => clear('ceo')} class={authInput({ size: 'md', invalid: !!show('ceo'), filled: !!values.ceo })} />
			{@render err('ceo')}
		</div>
		<div class="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
			<span class="text-[12.5px] text-white/55">세금계산서 받는 이메일</span>
			<span class="text-[14px] font-bold break-all">{info?.taxEmail || '초대받은 이메일'}</span>
			<span class={AUTH_HINT}>정산금 세금계산서는 이 이메일로 받아요(초대받은 이메일 · 바꾸려면 MYR 파트너팀에 연락해 주세요)</span>
		</div>
	</fieldset>

	<fieldset class="flex flex-col gap-4">
		<legend class="mb-3 text-[15px] font-extrabold lg:text-[16px]">정산 계좌</legend>
		<div class="flex flex-col gap-2">
			<label for="s-bank" class={AUTH_LABEL}>은행</label>
			<select id="s-bank" bind:value={values.bank} onchange={() => clear('bank')} class="{authInput({ size: 'md', invalid: !!show('bank'), filled: !!values.bank })} appearance-none">
				<option value="" disabled>은행을 골라 주세요</option>
				{#each BANKS as b (b)}<option value={b}>{b}</option>{/each}
				{#if values.bank && !(BANKS as readonly string[]).includes(values.bank)}<option value={values.bank}>{values.bank}</option>{/if}
			</select>
			{@render err('bank')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-account" class={AUTH_LABEL}>계좌번호</label>
			<input
				id="s-account"
				inputmode="numeric"
				autocomplete="off"
				placeholder={info?.accountMasked ? `${info.accountMasked} · 바꿀 때만 입력` : '숫자만 입력'}
				value={values.account}
				oninput={(e) => {
					values.account = digitsOnly(e.currentTarget.value).slice(0, 16);
					e.currentTarget.value = values.account;
					clear('account');
				}}
				class={authInput({ size: 'md', invalid: !!show('account'), filled: !!values.account })}
			/>
			{@render err('account')}
		</div>
		<div class="flex flex-col gap-2">
			<label for="s-holder" class={AUTH_LABEL}>예금주</label>
			<input id="s-holder" autocomplete="off" placeholder="상호 또는 대표자 이름" maxlength="50" bind:value={values.holder} oninput={() => clear('holder')} class={authInput({ size: 'md', invalid: !!show('holder'), filled: !!values.holder })} />
			{#if show('holder')}{@render err('holder')}{:else}<p class={AUTH_HINT}>사업자 계좌(예금주 = 상호) 또는 대표자 본인 명의 개인 계좌만 받아요</p>{/if}
		</div>
	</fieldset>

	{#if formError}<p class="text-center text-[13px] font-semibold text-accent" role="alert">{formError}</p>{/if}
	<button type="submit" disabled={busy} class={authButton(!busy)}>{busy ? '저장하는 중…' : submitLabel}</button>
	{#if footer}{@render footer()}{/if}
</form>
