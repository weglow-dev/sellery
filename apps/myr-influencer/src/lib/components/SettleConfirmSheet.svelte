<script lang="ts">
	import { SETTLE_REAUTH_NOTICE, SETTLE_REVIEW_NOTICE } from '@sellery/myr-core/settle-info';
	import { authButton } from '$lib/auth-ui';

	/**
	 * 정보 수정 확인 시트(0124) — 토스 본인인증을 마친 크리에이터(서버 reviewOnChange)가 [수정 저장하기]를 누르면 한 번 묻는다. 모바일은 바텀시트, PC(lg~)는 가운데 대화상자.
	 * 바뀐 칸 이름(화면 비교 · settleChangedFields) · 안내 문구 · 재인증 규칙 한 줄(어느 변경이 재인증인지는 서버가 정하고, 확인 중 상태 카드가 서버 값 reauthAfterReview 로 알린다).
	 * 바깥 탭 · Esc 로 닫힌다(저장 안 함).
	 */
	let { fields, busy = false, onconfirm, onclose }: { fields: string[]; busy?: boolean; onconfirm: () => void; onclose: () => void } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !busy) onclose();
	}

	/** body 로 옮겨 그린다 — 내 정보 화면을 감싼 요소의 등장 애니메이션(transform) 안에서는 fixed 가 화면이 아니라 그 요소 기준이 된다 */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

<svelte:window {onkeydown} />

<div use:portal class="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center" role="dialog" aria-modal="true" aria-labelledby="settle-confirm-title">
	<button type="button" class="absolute inset-0 bg-black/62" aria-label="닫기" onclick={() => !busy && onclose()}></button>
	<div class="relative animate-up-in rounded-t-[28px] border-t border-white/12 bg-[#0d0e12] px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:w-[440px] lg:rounded-[24px] lg:border lg:p-7">
		<div class="flex justify-center pb-3 lg:hidden"><span class="h-1 w-10 rounded-sm bg-white/20"></span></div>
		<h2 id="settle-confirm-title" class="text-[19px] font-extrabold tracking-[-0.02em]">정보를 바꿀까요?</h2>
		{#if fields.length}
			<ul class="mt-3 flex flex-wrap gap-1.5" aria-label="바뀐 칸">
				{#each fields as f (f)}<li class="rounded-lg bg-white/7 px-2.5 py-1 text-[12.5px] font-bold text-white/85">{f}</li>{/each}
			</ul>
		{/if}
		<p class="mt-4 rounded-[14px] border border-accent/18 bg-accent/7 px-3.5 py-3 text-[13px] leading-[1.6] text-white/80">{SETTLE_REVIEW_NOTICE}</p>
		<p class="mt-2 text-[12.5px] leading-[1.6] text-white/55">{SETTLE_REAUTH_NOTICE}</p>
		<div class="mt-5 flex flex-col gap-1.5 lg:flex-row-reverse lg:gap-3">
			<button type="button" onclick={onconfirm} disabled={busy} aria-busy={busy} class="{authButton(!busy)} lg:flex-1">{busy ? '저장하는 중…' : '저장하고 확인 요청'}</button>
			<button type="button" onclick={onclose} disabled={busy} class="h-12 w-full rounded-2xl text-[14px] font-bold text-white/60 hover:text-fg lg:h-14 lg:flex-1 lg:border lg:border-white/14">다시 볼게요</button>
		</div>
	</div>
</div>
