<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import StepHead from './StepHead.svelte';
	import { MEETING_SLOTS, type ApplyErrors } from '$lib/utils/apply-options';
	import { formatPhone } from '$lib/utils/phone';
	import { bodyCls, ctaOff, ctaOn, errCls, footCls, inputCls, labelCls, scrollCls } from './shared';

	/** 마지막 · 연락처. 앞 단계에서 모은 답(hidden)과 함께 한 <form> 으로 POST 한다 — 검증·결과 처리는 퍼널이 넘긴 submit(use:enhance) 이 맡는다. */
	let {
		hidden,
		name = $bindable(''),
		phone = $bindable(''),
		slot = $bindable(''),
		agree = $bindable(false),
		errors,
		formError,
		submitting,
		canSubmit,
		submit
	}: {
		/** 앞 단계 답 — name 속성 → 값 */
		hidden: Record<string, string>;
		name: string;
		phone: string;
		slot: string;
		agree: boolean;
		errors: ApplyErrors;
		formError: string;
		submitting: boolean;
		canSubmit: boolean;
		submit: SubmitFunction;
	} = $props();
</script>

<form method="POST" class="flex min-h-0 flex-1 flex-col" use:enhance={submit}>
	{#each Object.entries(hidden) as [key, value] (key)}
		<input type="hidden" name={key} {value} />
	{/each}

	<div class="{scrollCls} pb-6">
		<StepHead eyebrow="마지막 · 연락처" title={['마지막이에요.', '어디로 연락드릴까요?']} help="전담 매니저가 내용을 확인한 뒤 미팅 일정을 제안드려요." />
		<div class="mt-6 flex flex-col gap-[18px] {bodyCls} lg:mt-7 lg:grid lg:grid-cols-2 lg:gap-x-6">
			<div class="flex flex-col gap-2">
				<label for="name" class={labelCls}>활동명 또는 채널</label>
				<input id="name" name="name" bind:value={name} type="text" autocomplete="nickname" placeholder="@instagram 또는 유튜브 채널명" class="{inputCls} h-14" />
				{#if errors.name}<p class={errCls}>{errors.name}</p>{/if}
			</div>
			<div class="flex flex-col gap-2">
				<label for="phone" class={labelCls}>연락처</label>
				<input
					id="phone"
					name="phone"
					value={phone}
					oninput={(e) => (phone = formatPhone(e.currentTarget.value))}
					type="tel"
					inputmode="numeric"
					maxlength="13"
					autocomplete="tel"
					placeholder="010-0000-0000"
					class="{inputCls} h-14 tabular-nums"
				/>
				{#if errors.phone}<p class={errCls}>{errors.phone}</p>{/if}
			</div>
			<div class="flex flex-col gap-2 lg:col-span-2">
				<p id="slot-label" class={labelCls}>미팅 선호 시간대 <span class="font-medium text-fg/50">(선택)</span></p>
				<div role="group" aria-labelledby="slot-label" class="grid grid-cols-3 gap-2">
					{#each MEETING_SLOTS as s (s.value)}
						{@const on = slot === s.value}
						<button
							type="button"
							aria-pressed={on}
							onclick={() => (slot = on ? '' : s.value)}
							class="flex flex-col items-center gap-1 rounded-[14px] border-[1.5px] px-2 py-3.5 text-fg transition {on
								? 'border-accent bg-accent/10'
								: 'border-white/10 bg-white/[0.04] hover:border-white/25'}"
						>
							<span class="text-sm font-bold">{s.value}</span>
							<span class="text-[11px] text-fg/60">{s.hint}</span>
						</button>
					{/each}
				</div>
			</div>
			<label
				id="agree-box"
				class="flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] px-4 py-3.5 transition-colors lg:col-span-2 {errors.agree
					? 'border-accent bg-accent/[0.06]'
					: 'border-transparent bg-white/[0.03]'}"
			>
				<input name="agree" type="checkbox" bind:checked={agree} class="m-0 size-[22px] shrink-0 accent-[color:var(--color-accent)]" />
				<span class="text-[13px] leading-[1.55] text-fg/70">
					<b class="font-bold text-fg">(필수)</b> 남겨주신 연락처는 제조의뢰 상담 목적으로만 사용되며, 상담 종료 후 파기돼요.
				</span>
			</label>
			{#if errors.agree}<p role="alert" class="{errCls} -mt-2 lg:col-span-2">{errors.agree}</p>{/if}
		</div>
	</div>
	<div class={footCls}>
		{#if formError}
			<p role="alert" class="mb-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-semibold text-fg lg:max-w-[900px] lg:self-stretch">{formError}</p>
		{/if}
		<button type="submit" disabled={submitting} class="{canSubmit ? ctaOn : `${ctaOff} text-fg/60 hover:bg-white/[0.12]`} disabled:pointer-events-none disabled:opacity-60">
			{submitting ? '접수하는 중…' : '제조의뢰 접수하기'}
		</button>
	</div>
</form>
