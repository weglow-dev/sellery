<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { formatPhone } from '@sellery/myr-core/phone';
	import { COMPANY } from '@sellery/myr-core/company';
	import type { TossCard } from '$lib/toss-card';

	/**
	 * 내 정보 "토스 본인인증" 카드(2026-11-18 · 토스페이먼츠 지급대행 · 시안 "MYR Influencer Admin" · "… PC" 내 정보) — "사업자 · 정산 정보" 상태 카드 바로 아래.
	 * 시안 구성: 제목 + 칩 · 한 문장(굵은 번호) · 회색 안내 · [인증을 마쳤어요] + "문자를 못 받았어요 ⌄"(한 줄) · 도움말(스팸함 · [수정하기]에서 번호 고치기 · [파트너팀에 문의]).
	 * 시안과 다른 점: "아직 인증 전이에요" 상태 줄(시안은 누르면 항상 완료) · 토스가 정보를 거절했을 때 [수정하기](시안에 없는 상태).
	 * 정산금은 ① 사업자 · 정산 정보 확인(운영팀) ② 토스 본인인증(크리에이터) 둘 다 끝나야 받는다 — 두 카드를 나란히 두어 남은 일을 보여 준다.
	 * 칩 · 문장 · 안내는 서버 값(toss) 그대로. [인증을 마쳤어요] → POST /api/my/toss(지금은 미리보기만 · preview = 미리보기 상태).
	 * onfix: [수정하기](토스가 거절한 칸) — 부모가 입력 폼을 열고 그 칸으로 보낸다.
	 * 처음 값(initial)만 서버에서 — 확인 결과로 이 카드 안에서 바뀐다(부모가 상태가 바뀌면 {#key} 로 다시 그린다).
	 */
	// expanded — 카드가 늘어났는지("문자를 못 받았어요" 펼침 · 확인 상태 줄). 부모가 오른쪽 카드 높이를 늘어나기 전 값으로 고정할 때 읽는다
	let { initial, preview = null, onfix, expanded = $bindable(false) }: { initial: TossCard; preview?: string | null; onfix: (field: 'bizNo' | 'account' | 'ceoPhone') => void; expanded?: boolean } = $props();
	let helpOpen = $state(false);
	let toss = $state(untrack(() => initial));

	let checking = $state(false);
	let attempt = $state(0);
	let error = $state<string | null>(null);
	// 시안 칩 · 테두리 색 — 인증 전 주황 · 인증 완료 민트 · 추가 인증 · 정보 확인 필요 빨강
	const TONE: Record<TossCard['chip']['tone'], string> = { muted: 'bg-white/8 text-white/70', accent: 'bg-accent/14 text-[#ff9a66]', ok: 'bg-mint/12 text-mint', danger: 'bg-[#ff6b6b]/14 text-[#ff8a8a]' };
	const BORDER: Record<TossCard['chip']['tone'], string> = { muted: 'border-white/8', accent: 'border-accent/30', ok: 'border-white/8', danger: 'border-[#ff6b6b]/32' };
	const csExternal = /^https?:\/\//.test(COMPANY.csUrl);

	$effect(() => {
		expanded = helpOpen || (toss.canCheck && (checking || toss.notYet || !!error));
	});

	// [토스페이먼츠에 다시 등록하기](2026-11-20) — 서버가 지금도 등록 전인지(toss_ask register) 다시 보고 등록한다. 성공하면 화면 값을 다시 읽는다(상태 카드 · 홈 배너)
	let registering = $state(false);
	async function register() {
		if (registering) return;
		registering = true;
		error = null;
		try {
			const res = await fetch('/api/my/toss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'register' }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; toss?: TossCard; message?: string } | null;
			if (r?.toss) toss = r.toss;
			if (r?.ok) await invalidateAll();
			else error = r?.message ?? '지금은 등록하지 못했어요. 잠시 후 다시 눌러 주세요';
		} catch {
			error = '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요';
		} finally {
			registering = false;
		}
	}

	async function check() {
		if (checking) return;
		checking = true;
		error = null;
		attempt += 1;
		try {
			const res = await fetch('/api/my/toss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preview, attempt }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; toss?: TossCard; message?: string } | null;
			if (r?.ok && r.toss) toss = r.toss;
			else error = r?.message ?? '지금은 확인하지 못했어요. 잠시 후 다시 눌러 주세요';
		} catch {
			error = '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요';
		} finally {
			checking = false;
		}
	}
</script>

<section aria-label="토스 본인인증" class="rounded-[20px] border bg-white/3 p-5 transition-colors lg:rounded-3xl {BORDER[toss.chip.tone]}">
	<div class="flex items-center justify-between gap-2.5">
		<p class="text-[15px] font-extrabold">토스 본인인증</p>
		<span class="shrink-0 rounded-[9px] px-2.5 py-[5px] text-[12px] font-bold whitespace-nowrap {TONE[toss.chip.tone]}">{toss.chip.label}</span>
	</div>
	<p class="mt-3 text-[13.5px] leading-[1.55] text-white/85 tabular-nums">{toss.lead}{#if toss.phone}<b class="font-extrabold text-fg">{formatPhone(toss.phone)}</b>{/if}{toss.tail}</p>
	{#if toss.note}<p class="mt-1.5 text-[12px] leading-[1.55] text-white/45">{toss.note}</p>{/if}
	{#if toss.review}<p class="mt-2 text-[12px] leading-[1.55] font-semibold text-[#ff9a66]">{toss.review}</p>{/if}

	{#if toss.canCheck && (checking || toss.notYet || error)}
		<p class="mt-3 flex items-center gap-2 text-[12.5px] font-semibold {error ? 'text-[#ff8a8a]' : 'text-white/70'}" role="status">
			{#if !error}<span class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true"></span>{/if}
			{error ?? (checking ? '토스페이먼츠에 인증 결과를 확인하고 있어요' : '아직 인증 전이에요 · 인증을 마치고 다시 눌러 주세요')}
		</p>
	{/if}

	{#if toss.canCheck}
		<div class="mt-3.5 flex items-center gap-1.5">
			<button type="button" onclick={check} disabled={checking} aria-busy={checking} class="h-[42px] min-w-0 flex-1 rounded-[13px] text-[14px] font-extrabold whitespace-nowrap transition-colors {checking ? 'bg-white/8 text-white/45' : 'bg-accent text-bg hover:bg-[#ff8f5c]'}">{checking ? '확인하는 중…' : '인증을 마쳤어요'}</button>
			{#if toss.phoneHelp}
				<button type="button" onclick={() => (helpOpen = !helpOpen)} aria-expanded={helpOpen} class="flex h-[42px] shrink-0 items-center gap-[3px] pr-1 pl-2.5 text-[12.5px] font-bold whitespace-nowrap text-white/60 hover:text-fg">
					문자를 못 받았어요
					<svg class="transition-transform {helpOpen ? 'rotate-180' : ''}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
				</button>
			{/if}
		</div>
	{/if}
	{#if toss.phoneHelp && helpOpen}
		<div class="mt-2.5 animate-up-in rounded-[13px] bg-white/4 px-3.5 py-3">
			<!-- 대표자 휴대폰을 고쳐 저장하면 다시 등록 · 새 번호로 문자(0121 toss_action — 본인인증 전) -->
			<p class="text-[12.5px] leading-[1.6] text-white/70">스팸 문자함도 살펴봐 주세요. 번호가 다르면 [수정하기]에서 대표자 휴대폰을 고치면 문자를 다시 보내요.</p>
			<a href={COMPANY.csUrl} target={csExternal ? '_blank' : undefined} rel={csExternal ? 'noopener noreferrer' : undefined} class="mt-2.5 inline-flex h-[34px] items-center rounded-[11px] border border-white/14 px-3 text-[12.5px] font-bold text-fg hover:border-white/35">파트너팀에 문의</a>
		</div>
	{/if}

	{#if toss.canRegister}
		{#if error}<p class="mt-3 text-[12.5px] font-semibold text-[#ff8a8a]" role="status">{error}</p>{/if}
		<button type="button" onclick={register} disabled={registering} aria-busy={registering} class="mt-3.5 h-[42px] w-full rounded-[13px] text-[14px] font-extrabold transition-colors {registering ? 'bg-white/8 text-white/45' : 'bg-accent text-bg hover:bg-[#ff8f5c]'}">{registering ? '등록하는 중…' : '토스페이먼츠에 다시 등록하기'}</button>
	{/if}
	{#if toss.needConsent}
		<button type="button" onclick={() => onfix('ceoPhone')} class="mt-3.5 flex h-[42px] w-full items-center justify-center rounded-[13px] border border-white/16 text-[14px] font-bold hover:border-white/30 hover:bg-white/4">수정하기</button>
	{/if}
	{#if toss.fixField}
		<button type="button" onclick={() => toss.fixField && onfix(toss.fixField)} class="mt-3.5 flex h-[42px] w-full items-center justify-center rounded-[13px] border border-white/16 text-[14px] font-bold hover:border-white/30 hover:bg-white/4">수정하기</button>
	{/if}
</section>
