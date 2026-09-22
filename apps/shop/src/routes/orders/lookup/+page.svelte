<script lang="ts">
	/**
	 * 비회원 주문 조회 폼 (0021) — 주문번호 + 연락처. 실패 문구는 한 가지(열거 방지). 회원이면 「내 주문」 안내를 위에 한 줄.
	 */
	import { enhance } from '$app/forms';
	import { KAKAO_ICON as KakaoIcon } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
	const values = $derived(form?.values ?? { code: data.prefillCode, phone: '' });
	const INVALID_FRAME = '0 -2px 0 0 var(--color-danger), 0 2px 0 0 var(--color-danger), -2px 0 0 0 var(--color-danger), 2px 0 0 0 var(--color-danger)';
</script>

<svelte:head>
	<title>비회원 주문 조회 — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="store">
	<h2 class="pg">비회원 주문 조회 <small>주문번호 + 연락처</small></h2>

	<div class="card static" style="max-width:520px;margin:0 auto">
		{#if data.expired}
			<div class="notice" role="status" style="margin:0 0 12px">주문 조회 정보가 만료됐어요 — 주문번호와 연락처로 다시 조회해주세요</div>
		{/if}
		{#if data.signedIn}
			<div class="meta" style="margin-bottom:10px">카카오 로그인으로 주문한 건은 <a href="/account/orders" class="underline underline-offset-2">내 주문</a>에서 볼 수 있어요. 이 화면은 로그인 없이 구매한 주문용입니다.</div>
		{/if}
		<p class="meta" style="margin:0 0 14px">로그인 없이 구매한 주문은 <b>주문 완료 화면의 주문번호</b>(예: O2013)와 <b>주문 시 입력한 연락처</b>로 조회할 수 있어요. 조회한 기기에서는 90일 동안 다시 입력 없이 열립니다.</p>

		<form
			method="POST"
			action="?/lookup"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					busy = false;
					await update();
				};
			}}
		>
			<div class="fld">
				<label for="lk-code">주문번호</label>
				<input id="lk-code" name="code" value={values.code} placeholder="O2013" autocomplete="off" inputmode="text" maxlength="32" required disabled={busy} aria-invalid={form?.field === 'code' || undefined} style={form?.field === 'code' ? `box-shadow:${INVALID_FRAME}` : undefined} />
			</div>
			<div class="fld">
				<label for="lk-phone">연락처</label>
				<input id="lk-phone" name="phone" type="tel" value={values.phone} placeholder="01012345678" inputmode="numeric" autocomplete="tel" maxlength="20" required disabled={busy} aria-invalid={form?.field === 'phone' || undefined} style={form?.field === 'phone' ? `box-shadow:${INVALID_FRAME}` : undefined} />
				<div class="hint">주문자 연락처 또는 배송 연락처 — 숫자만 입력해도 돼요</div>
			</div>
			{#if form?.message}
				<div class="notice danger" role="alert" style="margin:0 0 12px">{form.message}</div>
			{/if}
			<div class="btnrow" style="justify-content:flex-end">
				<button type="submit" class="pri" disabled={busy}>{busy ? '조회 중…' : '주문 조회'}</button>
			</div>
		</form>

		<div class="meta" style="margin-top:16px;border-top:1px dashed var(--color-line);padding-top:12px">
			회원으로 주문했다면 → <a href="/login?next=%2Faccount%2Forders" class="btn sm kakao" style="vertical-align:middle"><KakaoIcon /> 카카오 로그인</a>
		</div>
	</div>
</div>
