<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { SETTLE_STATUS_META, type SettleInfo } from '@sellery/myr-core/settle-info';
	import { app } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import SettleInfoForm from '$lib/components/SettleInfoForm.svelte';

	/** 내 정보(9번 · 0085 · 시안 없음 — 콘솔 카드 톤). 프로필(읽기) · 사업자 · 정산 정보 상태(미입력 · 확인 중 · 확인 완료 · 다시 입력 필요).
	 *  오른쪽: 입력한 정보를 읽기 전용으로 모두 보여 주고 [수정하기] → 입력 폼(취소 가능). 미입력이면 바로 입력 폼(2026-11-09 대표 요청).
	 *  가입 2단계에서 건너뛴 정보도 여기서 넣는다. 저장은 SettleInfoForm → POST /api/my/settle. 계좌 · 사업자번호 · 대표자를 바꾸면 운영팀이 다시 확인한다(0085).
	 *  모바일: 뒤로 헤더 · 한 줄 / PC(lg~): 1240px · 왼쪽 프로필 · 상태 / 오른쪽 입력 */
	let { data } = $props();
	// 저장 응답으로 바로 바꾼다(처음 값만 서버에서)
	let info = $state<SettleInfo | null>(untrack(() => data.info));
	let editing = $state(untrack(() => !data.info || data.info.status === 'none'));
	const st = $derived(SETTLE_STATUS_META[info?.status ?? 'none']);
	const TONE: Record<string, string> = { muted: 'bg-white/8 text-white/70', accent: 'bg-accent/16 text-accent', ok: 'bg-mint/16 text-mint', danger: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' };

	async function saved(next: SettleInfo, recheck: boolean) {
		info = next;
		editing = false;
		app.showToast(recheck ? '저장했어요 · 운영팀이 확인한 뒤 정산금이 지급돼요' : '저장했어요');
		await invalidateAll();
	}
</script>

<svelte:head><title>내 정보 — MYR Creator</title></svelte:head>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="내 정보" fallback="/" />
	<h1 class="hidden text-[32px] font-extrabold tracking-[-0.03em] lg:block">내 정보</h1>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-10 lg:mt-6 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-3 lg:sticky lg:top-6">
			<section aria-label="프로필" class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
				<p class="text-[17px] font-extrabold">{data.seller.name}</p>
				<p class="mt-0.5 text-[13px] text-white/55">{data.seller.handle}</p>
				<dl class="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3 text-[13px]">
					<div class="flex justify-between gap-3"><dt class="text-white/55">로그인 이메일</dt><dd class="min-w-0 truncate font-semibold">{data.seller.email ?? '—'}</dd></div>
				</dl>
			</section>

			<section aria-label="정산 정보 상태" class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
				<div class="flex items-center justify-between gap-2">
					<p class="text-[15px] font-extrabold">사업자 · 정산 정보</p>
					<span class="rounded-lg px-2.5 py-[5px] text-[12px] font-bold {TONE[st.tone]}">{st.label}</span>
				</div>
				<p class="mt-2 text-[13px] leading-[1.6] text-white/70">{st.desc}</p>
				{#if info?.status === 'rejected' && info.note}
					<p class="mt-2.5 border-l-2 border-[#ff6b6b]/60 pl-2.5 text-[13px] leading-[1.55] text-white/85"><span class="font-bold text-[#ff8a8a]">운영팀</span> {info.note}</p>
				{/if}
				<p class="mt-3 text-[12px] leading-[1.55] text-white/45">계좌 · 사업자등록번호 · 대표자를 바꾸면 운영팀이 다시 확인해요. 확인이 끝나기 전에는 정산금 지급이 잠시 미뤄져요.</p>
			</section>
		</div>

		{#if editing}
			<section aria-label="사업자 · 정산 정보 입력" class="mt-3 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:mt-0 lg:p-6">
				<SettleInfoForm {info} submitLabel={info?.status === 'none' ? '저장하기' : '수정 저장하기'} onsaved={saved}>
					{#snippet footer()}
						{#if info && info.status !== 'none'}
							<button type="button" onclick={() => (editing = false)} class="h-12 w-full rounded-2xl text-[14px] font-bold text-white/60 hover:text-fg">취소</button>
						{/if}
					{/snippet}
				</SettleInfoForm>
			</section>
		{:else if info}
			<!-- 입력한 정보 — 읽기 전용(사업자번호 · 계좌는 가린 값) -->
			<section aria-label="사업자 · 정산 정보" class="mt-3 flex flex-col gap-5 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:mt-0 lg:p-6">
				{#snippet rows(title: string, items: [string, string][])}
					<div>
						<h2 class="text-[15px] font-extrabold lg:text-[16px]">{title}</h2>
						<dl class="mt-3 flex flex-col divide-y divide-white/6 rounded-2xl border border-white/8 bg-white/3 px-4">
							{#each items as [k, v] (k)}
								<div class="flex items-center justify-between gap-4 py-3.5 text-[14px] lg:text-[15px]"><dt class="shrink-0 text-white/55">{k}</dt><dd class="min-w-0 text-right font-semibold break-all tabular-nums">{v || '—'}</dd></div>
							{/each}
						</dl>
					</div>
				{/snippet}
				{@render rows('사업자 정보', [['상호', info.company], ['사업자등록번호', info.bizNoMasked ?? ''], ['대표자', info.ceo], ['세금계산서 이메일', info.taxEmail]])}
				{@render rows('정산 계좌', [['은행', info.bank], ['계좌번호', info.accountMasked ?? ''], ['예금주', info.holder]])}
				<button type="button" onclick={() => (editing = true)} class="flex h-14 w-full items-center justify-center rounded-2xl border border-white/16 text-[15px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4 lg:h-[60px] lg:text-[16px]">수정하기</button>
			</section>
		{/if}
	</div>
</div>
