<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, AVATAR_MESSAGES } from '@sellery/myr-core/avatar';
	import { formatPhone } from '@sellery/myr-core/phone';
	import { shortDate } from '@sellery/myr-core/order-view';
	import { platformName } from '$lib/signup-rules';
	import { tick, untrack } from 'svelte';
	import { SETTLE_LOCKED_NOTICE, SETTLE_REVIEW_NOTICE, SETTLE_STATUS_META, settleSavedToast, settleStatusDesc, type SettleInfo } from '@sellery/myr-core/settle-info';
	import { app } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SettleInfoForm from '$lib/components/SettleInfoForm.svelte';
	import { COMPANY } from '@sellery/myr-core/company';
	import TossAuthCard from '$lib/components/TossAuthCard.svelte';

	/** 내 정보(9번 · 0085 · 시안 없음 — 콘솔 카드 톤). 프로필(읽기) · 사업자 · 정산 정보 상태(미입력 · 확인 중 · 확인 완료 · 다시 입력 필요).
	 *  오른쪽: 입력한 정보를 읽기 전용으로 모두 보여 주고 [수정하기] → 입력 폼(취소 가능). 미입력이면 바로 입력 폼(2026-11-09 대표 요청).
	 *  가입 2단계에서 건너뛴 정보도 여기서 넣는다. 저장은 SettleInfoForm → POST /api/my/settle. 계좌 · 사업자번호 · 대표자를 바꾸면 운영팀이 다시 확인한다(0085).
	 *  모바일: 뒤로 헤더 · 한 줄 / PC(lg~): 1240px · 왼쪽 프로필 · 상태 / 오른쪽 입력
	 *  PC 는 펼치기 전(문자를 못 받았어요 · 수정하기) 세로 스크롤이 없게 여백을 줄이고, 오른쪽 읽기 카드는 왼쪽 세 카드의 **펼치기 전** 높이에 맞춘다
	 *  (왼쪽 토스 카드가 늘어나도(문자를 못 받았어요 · 확인 상태 줄) 오른쪽은 늘어나지 않는다 — 늘어난 동안은 왼쪽 높이를 재지 않는다)
	 *  토스 본인인증 카드(2026-11-18) — 상태 카드 바로 아래 · 값은 서버 data.toss. 지급대행 키가 있을 때 보인다(0124 · 시범운영은 테스트 키):
	 *  이 계정의 실제 상태(정보를 저장하면 토스 셀러 등록 · [인증을 마쳤어요]는 토스 다시 조회 · 웹훅 seller.changed) · 주소 ?toss=<상태> 면 그 상태 미리보기(목 · 개발 서버 · Preview) */
	let { data } = $props();
	// 저장 응답으로 바로 바꾼다(처음 값만 서버에서)
	let info = $state<SettleInfo | null>(untrack(() => data.info));
	let editing = $state(untrack(() => !data.info || data.info.status === 'none'));
	const st = $derived(SETTLE_STATUS_META[info?.status ?? 'none']);
	// 프로필 사진 — 여기서만 바꾼다(0085 · 홈은 보기만). 올리는 동안 미리보기 · 저장되면 서버 주소(레이아웃 me 를 다시 읽는다)
	const me = $derived(page.data.me as { initial: string; avatarBg: string; avatarUrl: string | null });
	let preview = $state('');
	let photoBusy = $state(false);
	const photo = $derived(preview || me?.avatarUrl || '');
	async function pickPhoto(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!f || photoBusy) return;
		if (f.size > AVATAR_MAX_BYTES) return app.showToast(AVATAR_MESSAGES.TOO_LARGE);
		photoBusy = true;
		const local = URL.createObjectURL(f);
		preview = local;
		try {
			const fd = new FormData();
			fd.set('file', f);
			const res = await fetch('/api/my/avatar', { method: 'POST', body: fd });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
			if (r?.ok) {
				await invalidateAll();
				app.showToast('프로필 사진을 바꿨어요');
			} else app.showToast(AVATAR_MESSAGES[r?.code ?? ''] ?? AVATAR_MESSAGES.DB_ERROR);
		} catch {
			app.showToast(AVATAR_MESSAGES.DB_ERROR);
		} finally {
			preview = '';
			URL.revokeObjectURL(local);
			photoBusy = false;
		}
	}
	async function removePhoto() {
		if (photoBusy) return;
		photoBusy = true;
		try {
			const r = (await (await fetch('/api/my/avatar', { method: 'DELETE' })).json().catch(() => null)) as { ok?: boolean } | null;
			if (r?.ok) {
				await invalidateAll();
				app.showToast('프로필 사진을 지웠어요');
			} else app.showToast(AVATAR_MESSAGES.DB_ERROR);
		} finally {
			photoBusy = false;
		}
	}
	const TONE: Record<string, string> = { muted: 'bg-white/8 text-white/70', accent: 'bg-accent/16 text-accent', ok: 'bg-mint/16 text-mint', danger: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' };

	/** 토스 카드 미리보기 상태(주소 ?toss= · 개발 서버 · Vercel Preview) — 없으면 이 계정의 실제 상태(가짜 토스) */
	const tossState = $derived(page.url.searchParams.get('toss'));
	/** 오른쪽 읽기 카드 높이(PC) — 왼쪽 세 카드의 늘어나기 전 높이. 토스 카드가 늘어난 동안은 재지 않는다 */
	let leftCol = $state<HTMLElement | null>(null);
	let leftH = $state(0);
	let tossHelp = $state(false);
	$effect(() => {
		const el = leftCol;
		if (!el) return;
		const measure = () => {
			if (!tossHelp) leftH = el.offsetHeight;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});
	// 본인인증을 마친 뒤 확인 중(서버 editLocked)에는 고칠 수 없다 — 잘못 넣었으면 파트너팀 문의 → 운영 "다시 입력 요청"(0124)
	const csExternal = /^https?:\/\//.test(COMPANY.csUrl);
	/** 토스 카드 [수정하기] · [대표자 휴대폰 고치기] — 입력 폼을 열고 그 칸으로(잠겼으면 잠금 안내로) */
	async function fixField(field: 'bizNo' | 'account' | 'ceoPhone') {
		if (info?.editLocked) {
			document.getElementById('settle-locked')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		editing = true;
		await tick();
		const el = document.getElementById(`s-${field}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		el?.focus({ preventScroll: true });
	}

	async function saved(next: SettleInfo, recheck: boolean) {
		info = next;
		editing = false;
		app.showToast(settleSavedToast(next, recheck));
		await invalidateAll();
	}
</script>

<svelte:head><title>내 정보 — MYR Creator</title></svelte:head>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-6">
	<BackHeader title="내 정보" fallback="/" />
	<h1 class="hidden text-[32px] font-extrabold tracking-[-0.03em] lg:block">내 정보</h1>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-10 lg:mt-6 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:overflow-visible lg:px-0 lg:pb-0">
		<div bind:this={leftCol} class="flex flex-col gap-3">
			<section aria-label="프로필" class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5">
				<div class="flex items-center gap-3.5">
					<label class="relative h-16 w-16 shrink-0 cursor-pointer" aria-label="프로필 사진 바꾸기">
						<span class="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full text-[22px] font-extrabold text-bg shadow-[0_0_0_2px_#0a0b0e,0_0_0_3.5px_rgba(255,255,255,.12)] {photoBusy ? 'opacity-60' : ''}" style:background={me?.avatarBg}>
							{#if photo}<img src={photo} alt="" class="absolute inset-0 h-full w-full object-cover" />{:else}{me?.initial}{/if}
						</span>
						<input type="file" accept={AVATAR_ACCEPT} onchange={pickPhoto} disabled={photoBusy} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
						<span class="absolute -right-[3px] -bottom-[3px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-accent text-bg" aria-hidden="true"><Icon id="cam" size={12} sw={2.4} /></span>
					</label>
					<span class="min-w-0">
						<span class="block truncate text-[18px] font-extrabold">{data.seller.name}</span>
						<span class="mt-0.5 block truncate text-[13px] text-white/55">{data.seller.handle}</span>
						<span class="mt-1.5 flex items-center gap-3 text-[12px] font-bold">
							<label class="relative cursor-pointer text-accent">{photoBusy ? '올리는 중…' : me?.avatarUrl ? '사진 변경' : '사진 등록'}<input type="file" accept={AVATAR_ACCEPT} onchange={pickPhoto} disabled={photoBusy} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
							{#if me?.avatarUrl && !photoBusy}<button type="button" onclick={removePhoto} class="text-white/45 hover:text-fg">삭제</button>{/if}
						</span>
					</span>
				</div>
				<dl class="mt-4 flex flex-col gap-2.5 border-t border-white/8 pt-3.5 text-[13px] lg:mt-3.5 lg:gap-2">
					<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">활동명</dt><dd class="min-w-0 truncate font-semibold">{data.seller.name}</dd></div>
					<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">핸들</dt><dd class="min-w-0 truncate font-semibold">{data.seller.handle}</dd></div>
					<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">대표 채널</dt><dd class="font-semibold">{platformName(data.seller.platform) || '—'}</dd></div>
					<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">연락처</dt><dd class="font-semibold tabular-nums">{data.seller.phone ? formatPhone(data.seller.phone) : '—'}</dd></div>
					<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">로그인 이메일</dt><dd class="min-w-0 truncate font-semibold">{data.seller.email ?? '—'}</dd></div>
					{#if data.seller.joinedAt}<div class="flex justify-between gap-3"><dt class="shrink-0 text-white/55">가입일</dt><dd class="font-semibold">{shortDate(data.seller.joinedAt)}</dd></div>{/if}
				</dl>
			</section>

			<!-- 토스 인증 대기(0124 · status toss)면 비활성 카드 — 본인인증을 마치면 확인이 끝난다(운영 확인 없음) -->
			<section aria-label="정산 정보 상태" class="rounded-[20px] border border-white/8 bg-white/3 p-4 lg:p-5 {info?.status === 'toss' ? 'opacity-60' : ''}">
				<div class="flex items-center justify-between gap-2">
					<p class="text-[15px] font-extrabold">사업자 · 정산 정보</p>
					<span class="rounded-lg px-2.5 py-[5px] text-[12px] font-bold {TONE[st.tone]}">{st.label}</span>
				</div>
				<p class="mt-2 text-[13px] leading-[1.6] text-white/70">{settleStatusDesc(info)}</p>
				{#if info?.status === 'rejected' && info.note}
					<p class="mt-2.5 border-l-2 border-[#ff6b6b]/60 pl-2.5 text-[13px] leading-[1.55] text-white/85"><span class="font-bold text-[#ff8a8a]">운영팀</span> {info.note}</p>
				{/if}
				<!-- 0124 — 토스에 등록된 크리에이터(서버 reviewOnChange)는 모든 변경이 운영 승인 때 토스에 반영 -->
				<p class="mt-3 text-[12px] leading-[1.55] text-white/45">{info?.reviewOnChange ? SETTLE_REVIEW_NOTICE : '토스 본인인증 전에는 정보를 고치면 운영 확인 없이 바로 토스페이먼츠에 등록돼요.'}</p>
			</section>

			{#if data.toss}
				{#key data.toss}<TossAuthCard initial={data.toss} preview={tossState} onfix={fixField} bind:expanded={tossHelp} />{/key}
			{/if}
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
			<section aria-label="사업자 · 정산 정보" style:--left-h={leftH ? `${leftH}px` : undefined} class="mt-3 flex flex-col gap-5 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:mt-0 lg:min-h-(--left-h) lg:justify-between lg:p-6">
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
				{@render rows('사업자 정보', [['상호', info.company], ['사업자등록번호', info.bizNoMasked ?? ''], ['대표자', info.ceo], ['대표자 휴대폰', info.ceoPhone ? formatPhone(info.ceoPhone) : ''], ['세금계산서 이메일', info.taxEmail]])}
				{@render rows('정산 계좌', [['은행', info.bank], ['계좌번호', info.accountMasked ?? ''], ['예금주', info.holder]])}
				{#if info.editLocked}
					<!-- 본인인증을 마친 뒤 확인 중(서버 editLocked · 0124) — 고칠 수 없다 · 잘못 넣었으면 문의 → 운영 다시 입력 요청 -->
					<div id="settle-locked" class="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/3 px-4 py-3.5">
						<p class="text-[13px] leading-[1.6] text-white/75">{SETTLE_LOCKED_NOTICE}</p>
						<div class="flex flex-wrap gap-2">
							<a href={COMPANY.csUrl} target={csExternal ? '_blank' : undefined} rel={csExternal ? 'noopener noreferrer' : undefined} class="inline-flex h-[38px] items-center rounded-xl border border-white/16 px-3.5 text-[13px] font-bold text-white/80 hover:border-white/30">파트너팀에 문의</a>
						</div>
					</div>
				{:else}
					<button type="button" onclick={() => (editing = true)} class="flex h-14 w-full items-center justify-center rounded-2xl border border-white/16 text-[15px] font-bold text-fg transition-colors hover:border-white/30 hover:bg-white/4 lg:h-[60px] lg:text-[16px]">수정하기</button>
				{/if}
			</section>
		{/if}
	</div>
</div>
