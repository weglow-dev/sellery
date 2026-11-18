<script lang="ts">
	import { TOSS_CONSENT } from '@sellery/myr-core/settle-info';
	import CheckBox from './auth/CheckBox.svelte';
	import ErrorText from './auth/ErrorText.svelte';

	/**
	 * 토스페이먼츠 지급대행 개인정보 제3자 제공 동의(0121) — 가입 폼 약관 상자 안의 한 줄(row) · 내 정보 정산 정보 폼(상자째).
	 * [보기]를 누르면 받는 곳 · 목적 · 항목 · 보유 기간이 펼쳐진다. 문구는 `@sellery/myr-core/settle-info` TOSS_CONSENT(⚠ 법무 확인 전 초안).
	 */
	let { checked = $bindable(false), name = undefined, invalid = false, row = false }: { checked?: boolean; name?: string; invalid?: boolean; row?: boolean } = $props();
	let open = $state(false);
</script>

{#snippet line()}
	<div class="flex items-center gap-2">
		<div class="flex-1"><CheckBox size={24} {name} bind:checked><span class="text-[14px] text-white/80"><span class="font-bold text-accent">필수</span> {TOSS_CONSENT.title}</span></CheckBox></div>
		<button type="button" onclick={() => (open = !open)} aria-expanded={open} aria-controls="toss-consent-detail" class="shrink-0 py-2 text-[12px] text-white/45 underline underline-offset-2">{open ? '접기' : '보기'}</button>
	</div>
	{#if open}
		<dl id="toss-consent-detail" class="mb-2 flex flex-col gap-2 rounded-xl bg-white/4 px-3.5 py-3 text-[12.5px] leading-[1.55]">
			{#each TOSS_CONSENT.rows as [k, v] (k)}
				<div class="flex gap-3"><dt class="w-[58px] shrink-0 text-white/50">{k}</dt><dd class="min-w-0 text-white/80">{v}</dd></div>
			{/each}
			<p class="text-white/50">{TOSS_CONSENT.note}</p>
		</dl>
	{/if}
{/snippet}

{#if row}
	{@render line()}
{:else}
	<div id="toss-consent" class="rounded-2xl border bg-white/3 px-4 py-1 {invalid ? 'border-accent' : 'border-white/8'}">{@render line()}</div>
	{#if invalid}<ErrorText text="토스페이먼츠 정보 제공에 동의해 주세요" />{/if}
{/if}
