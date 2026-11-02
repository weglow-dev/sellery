<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatPhoneInput } from '$lib/phone';
	import BackHeader from '$lib/components/BackHeader.svelte';

	/** 비회원 주문 조회 — 주문번호 + 연락처. 성공하면 서버가 쿠키를 심고 /orders/g/<code> 로 보낸다. */
	let { data, form } = $props();
	let submitting = $state(false);
	// svelte-ignore state_referenced_locally
	let code = $state(form?.values.code ?? data.prefill);
	// svelte-ignore state_referenced_locally
	let phone = $state(form?.values.phone ?? '');
	const inputCls = 'h-[54px] w-full rounded-[14px] border-[1.5px] bg-white/4 px-4 text-[16px] text-fg outline-none focus:border-accent focus:bg-accent/6 lg:text-[15px]';
	const border = (k: string) => (form?.field === k ? 'border-[#ff6b6b]' : 'border-white/10');
</script>

<svelte:head>
	<title>주문 조회 — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex animate-slide-in flex-col lg:mx-auto lg:max-w-[460px] lg:px-10 lg:pt-16 lg:pb-20">
	<BackHeader title="주문 조회" />
	<div class="px-5 pt-4 lg:px-0 lg:pt-0">
		<div class="rounded-[26px] border border-white/8 bg-panel p-6">
			<h1 class="text-[22px] leading-[1.3] font-extrabold tracking-[-.03em]">비회원 주문 조회</h1>
			<p class="mt-2 text-[14px] leading-[1.55] text-fg-soft">주문 완료 화면의 <b class="text-fg">주문번호</b>와 주문할 때 입력한 <b class="text-fg">연락처</b>를 넣어주세요.</p>
			<form method="post" class="mt-5 flex flex-col gap-2.5" use:enhance={() => { submitting = true; return async ({ update }) => { await update(); submitting = false; }; }}>
				<input name="code" bind:value={code} placeholder="주문번호 (예: MYR1001)" autocomplete="off" aria-label="주문번호" disabled={submitting} class="{inputCls} {border('code')} font-mono uppercase" />
				<input name="phone" value={phone} oninput={(e) => (phone = formatPhoneInput(e.currentTarget))} type="tel" inputmode="numeric" placeholder="010-0000-0000" autocomplete="tel" aria-label="연락처" disabled={submitting} class="{inputCls} {border('phone')} tabular-nums" />
				{#if form?.message}
					<p role="alert" class="rounded-[14px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[13px] leading-[1.5] text-white/85">{form.message}</p>
				{/if}
				<button type="submit" disabled={submitting} class="mt-1 h-14 w-full rounded-2xl bg-accent text-[16px] font-extrabold text-bg transition-opacity disabled:opacity-60">{submitting ? '찾는 중…' : '주문 찾기'}</button>
			</form>
			<p class="mt-4 border-t border-dashed border-white/10 pt-3 text-center text-[12.5px] leading-[1.55] text-fg-faint">카카오로 주문했다면 <a href="/login?next=/my" class="font-bold text-accent">로그인</a>하고 마이페이지에서 보세요</p>
		</div>
	</div>
</div>
