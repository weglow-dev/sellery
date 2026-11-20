<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { digitsOnly, SETTLE_FIELDS, SETTLE_REAUTH_NOTICE, SETTLE_REVIEW_NOTICE, settleChangedFields, settleErrors, type SettleField, type SettleInfo, type SettleValues } from '@sellery/myr-core/settle-info';
	import { formatPhone } from '@sellery/myr-core/phone';
	import { authButton } from '$lib/auth-ui';
	import SettleFields from './SettleFields.svelte';
	import TossConsent from './TossConsent.svelte';
	import SettleConfirmSheet from './SettleConfirmSheet.svelte';

	/**
	 * 사업자 · 정산 정보 입력(9번 · 0085) — 내 정보 `/my` 의 입력 폼(칸은 SettleFields · 초대 가입 폼도 같은 칸을 쓴다). 저장은 POST /api/my/settle(서버가 같은 규칙으로 다시 막는다).
	 * 저장된 사업자번호 · 계좌는 가린 값만 보여 주고, 비워 두면 그대로 둔다(바꿀 때만 입력). 세금계산서 이메일은 초대 이메일(입력 없음).
	 * 칸 규칙 · 문구는 `@sellery/myr-core/settle-info`. 오류는 [저장]을 누른 뒤부터 보인다.
	 * 대표자 휴대폰 · 토스페이먼츠 제3자 제공 동의(0121) — 동의는 아직 안 했을 때만 묻는다(서버 TOSS_CONSENT_REQUIRED).
	 * 0124 — 토스 본인인증을 마친 크리에이터(서버 reviewOnChange)의 변경은 운영 승인 때 토스에 반영된다: 폼 맨 위 안내 · [수정 저장하기]를 누르면 확인 시트(바뀐 칸 · 안내)를
	 *   한 번 띄운다. 본인인증 전에는 안내 · 시트 없이 바로 저장(저장하면 바로 토스에 반영). 어떤 안내를 보일지는 서버 값으로만 고른다.
	 */
	let { info, submitLabel = '저장하기', onsaved, footer }: { info: SettleInfo | null; submitLabel?: string; onsaved?: (info: SettleInfo, recheck: boolean) => void; footer?: Snippet } = $props();

	let values = $state<SettleValues>(untrack(() => ({ company: info?.company ?? '', ceo: info?.ceo ?? '', ceoPhone: formatPhone(info?.ceoPhone ?? ''), bizNo: '', bank: info?.bank ?? '', account: '', holder: info?.holder ?? '' })));
	let attempted = $state(false);
	let tossAgreed = $state(false);
	const needConsent = $derived(!info?.tossAgreed);
	const consentErr = $derived(attempted && needConsent && !tossAgreed);
	let busy = $state(false);
	let serverErr = $state<Partial<Record<SettleField, string>>>({});
	let formError = $state<string | null>(null);
	const saved = $derived({ hasBizNo: !!info?.hasBizNo, hasAccount: !!info?.hasAccount });
	// 이미 넣은 정보를 고칠 때는 바뀐 것이 있어야 저장(2026-11-09) — 사업자번호 · 계좌는 새로 입력했으면 바뀐 것. 처음 넣을 때(미입력)는 늘 켜 둔다
	const editing = $derived(!!info && info.status !== 'none');
	const changedFields = $derived(settleChangedFields(values, info));
	// 동의만 새로 체크해도 저장할 수 있다 — 동의 없이 저장된 크리에이터(0124 전)가 동의하고 토스에 등록(서버 toss_action)
	const changed = $derived(!editing || changedFields.length > 0 || (needConsent && tossAgreed));
	// 본인인증을 마친 크리에이터의 수정은 저장 전에 한 번 묻는다(서버 값 — 변경이 승인 때 반영)
	const askFirst = $derived(editing && !!info?.reviewOnChange);
	let confirming = $state(false);
	const errs = $derived({ ...settleErrors(values, saved), ...serverErr });
	const show = (k: SettleField) => (attempted || serverErr[k] ? errs[k] : undefined);
	const clear = (k: SettleField) => {
		if (serverErr[k]) serverErr = { ...serverErr, [k]: undefined };
		formError = null;
	};

	/** [저장] — 칸 검사 · 동의 확인 뒤, 등록된 크리에이터면 확인 시트부터 */
	function save() {
		if (!changed) return;
		attempted = true;
		const bad = SETTLE_FIELDS.find((k) => !!errs[k]);
		if (bad) {
			document.getElementById(`s-${bad}`)?.focus();
			return;
		}
		if (needConsent && !tossAgreed) {
			document.getElementById('toss-consent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		if (askFirst) confirming = true;
		else void send();
	}

	async function send() {
		busy = true;
		formError = null;
		try {
			const res = await fetch('/api/my/settle', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...values, bizNo: digitsOnly(values.bizNo), account: digitsOnly(values.account), ceoPhone: digitsOnly(values.ceoPhone), tossAgreed })
			});
			const r = (await res.json().catch(() => null)) as { ok?: boolean; recheck?: boolean; info?: SettleInfo; field?: SettleField; message?: string } | null;
			confirming = false;
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
			confirming = false;
			formError = '저장하지 못했어요. 인터넷 연결을 확인해 주세요';
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-5" onsubmit={(e) => (e.preventDefault(), save())} novalidate>
	{#if editing && info?.reviewOnChange}
		<!-- 0124 — 본인인증을 마친 크리에이터의 변경은 운영 승인 때 토스에 반영(서버 값으로 고른 안내) -->
		<p class="rounded-[14px] border border-accent/18 bg-accent/7 px-3.5 py-3 text-[13px] leading-[1.6] text-white/80">{SETTLE_REVIEW_NOTICE}<span class="mt-1 block text-white/55">{SETTLE_REAUTH_NOTICE}</span></p>
	{/if}
	<SettleFields bind:values {info} {show} {clear} />
	{#if needConsent}<TossConsent bind:checked={tossAgreed} invalid={consentErr} />{/if}

	{#if formError}<p class="text-center text-[13px] font-semibold text-accent" role="alert">{formError}</p>{/if}
	<button type="submit" disabled={busy || !changed} class="{authButton(!busy && changed)} disabled:cursor-not-allowed">{busy ? '저장하는 중…' : changed ? submitLabel : '바뀐 내용이 없어요'}</button>
	{#if footer}{@render footer()}{/if}
</form>

{#if confirming}
	<SettleConfirmSheet fields={changedFields.map((c) => c.label)} {busy} onconfirm={send} onclose={() => (confirming = false)} />
{/if}
