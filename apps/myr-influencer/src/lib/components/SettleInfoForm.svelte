<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { digitsOnly, SETTLE_FIELDS, settleErrors, type SettleField, type SettleInfo, type SettleValues } from '@sellery/myr-core/settle-info';
	import { authButton } from '$lib/auth-ui';
	import SettleFields from './SettleFields.svelte';

	/**
	 * 사업자 · 정산 정보 입력(9번 · 0085) — 내 정보 `/my` 의 입력 폼(칸은 SettleFields · 초대 가입 폼도 같은 칸을 쓴다). 저장은 POST /api/my/settle(서버가 같은 규칙으로 다시 막는다).
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
	// 이미 넣은 정보를 고칠 때는 바뀐 것이 있어야 저장(2026-11-09) — 사업자번호 · 계좌는 새로 입력했으면 바뀐 것. 처음 넣을 때(미입력)는 늘 켜 둔다
	const editing = $derived(!!info && info.status !== 'none');
	const changed = $derived(
		!editing ||
			values.company.trim() !== (info?.company ?? '') ||
			values.ceo.trim() !== (info?.ceo ?? '') ||
			values.bank !== (info?.bank ?? '') ||
			values.holder.trim() !== (info?.holder ?? '') ||
			values.bizNo.trim() !== '' ||
			values.account.trim() !== ''
	);
	const errs = $derived({ ...settleErrors(values, saved), ...serverErr });
	const show = (k: SettleField) => (attempted || serverErr[k] ? errs[k] : undefined);
	const clear = (k: SettleField) => {
		if (serverErr[k]) serverErr = { ...serverErr, [k]: undefined };
		formError = null;
	};

	async function save() {
		if (!changed) return;
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

<form class="flex flex-col gap-5" onsubmit={(e) => (e.preventDefault(), save())} novalidate>
	<SettleFields bind:values {info} {show} {clear} />

	{#if formError}<p class="text-center text-[13px] font-semibold text-accent" role="alert">{formError}</p>{/if}
	<button type="submit" disabled={busy || !changed} class="{authButton(!busy && changed)} disabled:cursor-not-allowed">{busy ? '저장하는 중…' : changed ? submitLabel : '바뀐 내용이 없어요'}</button>
	{#if footer}{@render footer()}{/if}
</form>
