<script lang="ts">
	import { isComposing } from '$lib/ime';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick, untrack } from 'svelte';
	import { creatorStyle } from '@sellery/myr-core/creator';
	import { INVITE_DAYS, isInviteClosed, type HandleStatus } from '@sellery/myr-core/invite-rules';
	import { caretAfterFormat, formatPhone } from '@sellery/myr-core/phone';
	import { INVITER } from '$lib/auth-copy';
	import { AUTH_HINT, AUTH_LABEL, authButton, authInput } from '$lib/auth-ui';
	import {
		HANDLE_MAX,
		NAME_MAX,
		PLATFORMS,
		SIGNUP_FIELDS,
		TERMS,
		allAgreed,
		cleanHandleInput,
		inviteValidity,
		missingCount,
		platformName,
		signupErrors,
		submitLabel,
		type SignupField,
		type TermId
	} from '$lib/signup-rules';
	import AuthLogo from '$lib/components/auth/AuthLogo.svelte';
	import AuthToast from '$lib/components/auth/AuthToast.svelte';
	import CheckBox from '$lib/components/auth/CheckBox.svelte';
	import ErrorText from '$lib/components/auth/ErrorText.svelte';
	import PasswordToggle from '$lib/components/auth/PasswordToggle.svelte';
	import SettleInfoForm from '$lib/components/SettleInfoForm.svelte';
	import type { SettleInfo } from '@sellery/myr-core/settle-info';

	/**
	 * 크리에이터 초대 가입 — 시안 "MYR Influencer Signup"(모바일) · "… PC". 화면: 초대장 → 가입 폼 → **사업자 · 정산 정보(2단계 · 건너뛸 수 있다 · 0085 · 2026-11-09)** → 환영 / 만료.
	 * 2단계는 바로 로그인이 된 경우에만(저장 API 가 세션을 본다) — 건너뛰면 콘솔 홈 배너 · 내 정보 `/my` 에서 넣는다.
	 * 가입은 form action `?/signup`(+page.server.ts — 계정 생성 · 크리에이터 연결 · 바로 로그인). 칸 규칙 · 문구는 lib/signup-rules.ts(서버 검증도 같은 함수).
	 * 핸들 중복 · 예약어는 칸을 **벗어날 때** 한 번 서버에 묻는다(`./handle` · 같은 핸들은 기억) — 가입 때 서버가 다시 본다(경합).
	 * 시안과 다른 점(정한 가입 방식에 맞춤 · docs/myr.md §4.2.1):
	 *   - 이메일은 초대받은 주소로 **고정**(초대 링크가 이메일 소유를 증명) — 시안은 입력 칸이었다
	 *   - 환영 화면에 "인증 메일을 보냈어요 · 다시 보내기" 가 없다 — 초대 링크가 이미 인증이라 메일이 필요 없다
	 * 모바일은 콘솔 셸과 같은 방식(화면 높이 고정 · 안에서만 스크롤 · 하단 버튼 줄은 보통 흐름 — 모바일 브라우저에서 fixed/sticky bottom 이 잘린다), PC(lg~)는 문서 흐름 2단.
	 */
	let { data, form } = $props();

	type Screen = 'invite' | 'form' | 'settle' | 'done' | 'expired';
	// 첫 화면 · 칸 초기값은 서버 데이터로 한 번만(이후는 이 화면 안에서 바뀐다)
	let screen = $state<Screen>(untrack(() => (data.state === 'valid' ? 'invite' : 'expired')));

	const invite = $derived(data.state === 'valid' ? data : null);
	/** 2단계 폼의 처음 값 — 비어 있음 · 세금계산서 이메일 = 초대받은 이메일 */
	const settleSeed = $derived<SettleInfo>({ company: '', ceo: '', bizNoMasked: null, hasBizNo: false, bank: '', holder: '', accountMasked: null, hasAccount: false, taxEmail: invite?.email ?? '', status: 'none', note: null, submittedAt: null, checkedAt: null });
	const validity = $derived(invite ? inviteValidity(invite.expiresAt) : null);

	let values = $state({
		password: '',
		confirm: '',
		name: '',
		handle: '',
		platform: null as string | null,
		phone: '',
		agreed: { tos: false, privacy: false } as Record<TermId, boolean>
	});
	let touched = $state<Partial<Record<SignupField, boolean>>>({});
	let attempted = $state(false);
	let showPw = $state(false);
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let busy = $state(false);
	let signedIn = $state(false);
	/** 링크가 닫힌 이유 — USED 면 "이미 가입" 문구 */
	let closedReason = $state<string | null>(untrack(() => (data.state === 'expired' ? data.reason : null)));
	/** 핸들별 서버 확인 결과(칸을 벗어날 때 물어본 것) · 지금 묻는 중인 핸들 */
	let checked = $state<Record<string, HandleStatus>>({});
	let checking = $state<string | null>(null);
	/** 서버가 가입을 거절한 칸 문구(그 칸을 고치면 지운다) · 칸이 없는 안내 */
	let serverErr = $state<Partial<Record<SignupField, string>>>({});
	let formError = $state<string | null>(null);

	const errs = $derived(signupErrors(values, checked));
	const missing = $derived(missingCount(errs, values.agreed));
	const shown = (k: SignupField) => ((touched[k] || attempted) && !!errs[k]) || !!serverErr[k];
	const errText = (k: SignupField) => errs[k] || serverErr[k] || '';
	const handle = $derived(cleanHandleInput(values.handle));
	const handleOk = $derived(!!handle && !errs.handle && !serverErr.handle && checked[handle] === 'available');
	const confirmOk = $derived(!!values.confirm && !errs.confirm && !errs.password);
	const termsAll = $derived(allAgreed(values.agreed));
	const termsErr = $derived(attempted && !termsAll);

	/** 샵 미리보기 — 샵 상품 카드와 같은 아바타 계산(이니셜 · 핸들 색). 비었으면 회색 · ? */
	const preview = $derived.by(() => {
		const name = values.name.trim();
		const st = creatorStyle({ name: name || '?', handle: handle || '' });
		return { name: name || '활동명', named: !!name, handle: handle || 'handle', bg: handle ? st.bg : 'rgba(255,255,255,0.12)', initial: name ? st.initial : '?', platform: platformName(values.platform) };
	});

	function showToast(msg: string) {
		clearTimeout(toastTimer);
		toast = msg;
		toastTimer = setTimeout(() => (toast = null), 2600);
	}

	const touch = (k: SignupField) => () => (touched[k] = true);
	const clearServer = (k: SignupField) => () => {
		if (serverErr[k]) serverErr = { ...serverErr, [k]: undefined };
	};

	/** 핸들 칸을 벗어날 때 — 형식이 맞고 아직 안 물어본 핸들만 서버에 한 번 */
	async function onHandleBlur() {
		touched.handle = true;
		const h = handle;
		if (!h || checked[h] || errs.handle || checking === h) return;
		checking = h;
		try {
			const res = await fetch(`/invite/${page.params.token}/handle?h=${encodeURIComponent(h)}`, { headers: { accept: 'application/json' } });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; status?: HandleStatus; code?: string } | null;
			if (r?.ok && r.status) checked = { ...checked, [h]: r.status };
			else if (r && isInviteClosed(r.code)) {
				closedReason = r.code ?? null;
				screen = 'expired';
			}
			// 그 밖(요청 과다 · 서버 오류)은 조용히 — 가입 때 서버가 다시 본다
		} catch {
			/* 네트워크 — 가입 때 서버가 다시 본다 */
		} finally {
			if (checking === h) checking = null;
		}
	}

	/** 연락처 — 숫자만 · 하이픈 자동 · 가운데를 고쳐도 커서가 그 자리에(공용 phone 규칙) */
	function onPhoneInput(e: Event & { currentTarget: HTMLInputElement }) {
		if (isComposing(e)) return; // 한글 조합 중에 값을 바꾸면 덜 끝난 글자가 다른 칸으로 넘어간다 — 조합이 끝나면(compositionend) 정리
		const el = e.currentTarget;
		const before = el.value;
		const caret = el.selectionStart ?? before.length;
		const next = formatPhone(before);
		if (before !== next) {
			el.value = next;
			const pos = caretAfterFormat(before, caret, next);
			el.setSelectionRange(pos, pos);
		}
		values.phone = next;
		if (serverErr.phone) serverErr = { ...serverErr, phone: undefined };
	}

	/** 핸들 — @ · 공백 제거 · 소문자로 바로 정리 */
	function onHandleInput(e: Event & { currentTarget: HTMLInputElement }) {
		if (isComposing(e)) return; // 한글 조합 중에는 다시 쓰지 않는다(판매가 칸과 같은 이유)
		const el = e.currentTarget;
		const next = cleanHandleInput(el.value);
		if (el.value !== next) el.value = next;
		values.handle = next;
		if (serverErr.handle) serverErr = { ...serverErr, handle: undefined };
	}

	const toggleAll = () => {
		const on = !termsAll;
		values.agreed = { tos: on, privacy: on };
	};

	/** 칸으로 — 화면 밖에 있으면 스크롤 · 입력 칸이면 포커스 */
	async function goToField(k: SignupField | 'terms' | undefined) {
		await tick();
		const el = document.getElementById(k ? `f-${k}` : 'f-terms');
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
	}

	/** 가입 제출 — 빠진 칸이 있으면 보내지 않고 첫 칸으로. 서버 응답: 성공 → 환영 · 링크가 닫힘 → 만료 · 칸 문제 → 그 칸 · 그 밖 → 버튼 위 안내 */
	const submitSignup: SubmitFunction = ({ cancel }) => {
		if (missing > 0) {
			cancel();
			attempted = true;
			goToField(SIGNUP_FIELDS.find((k) => !!errs[k]));
			return;
		}
		busy = true;
		formError = null;
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success' && result.data?.ok) {
				signedIn = result.data.signedIn === true;
				// 바로 로그인됐으면 사업자 · 정산 정보(건너뛸 수 있다) → 환영. 아니면 바로 환영(로그인 화면으로). 미리보기는 저장 없이 2단계도 보여 준다
				screen = signedIn || data.preview ? 'settle' : 'done';
				window.scrollTo(0, 0);
				return;
			}
			const d = (result.type === 'failure' ? result.data : null) as { screen?: string; code?: string; field?: SignupField | 'terms'; message?: string } | null;
			if (d?.screen === 'expired') {
				closedReason = d.code ?? null;
				screen = 'expired';
				window.scrollTo(0, 0);
				return;
			}
			if (d?.field && d.field !== 'terms' && d.message) {
				serverErr = { ...serverErr, [d.field]: d.message };
				goToField(d.field);
				return;
			}
			formError = d?.message ?? '가입을 마치지 못했어요. 잠시 후 다시 시도해주세요';
			showToast(formError);
		};
	};

	const sectionLabel = 'text-[12px] font-extrabold tracking-[0.02em] text-accent lg:text-[13px]';
</script>

<svelte:head><title>{screen === 'expired' ? (closedReason === 'USED' ? '이미 가입한 초대 링크' : '초대 링크 만료') : '크리에이터 가입'} — MYR Creator</title></svelte:head>

<div class="relative flex h-dvh flex-col overflow-hidden bg-bg lg:h-auto lg:min-h-dvh lg:overflow-clip">
	<div class="pointer-events-none absolute -top-40 -right-[140px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.26),rgba(10,11,14,0))] lg:-top-[240px] lg:-right-[200px] lg:h-[700px] lg:w-[700px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,.22),rgba(10,11,14,0))]"></div>
	<div class="pointer-events-none absolute -bottom-[300px] -left-[240px] hidden h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(184,196,245,.1),rgba(10,11,14,0))] lg:block"></div>

	{#if data.preview}
		<!-- 미리보기 주소(dev · Preview 만) — 저장하지 않는다 -->
		<p class="pointer-events-none fixed top-4 right-4 z-50 rounded-full border border-mint/30 bg-[#0f1a17]/90 px-3 py-1.5 text-[12px] font-bold text-mint lg:top-5 lg:right-auto lg:left-1/2 lg:-translate-x-1/2">미리보기 · 저장되지 않아요</p>
	{/if}

	<!-- PC 머리 — 로고 · 오른쪽 로그인 링크 -->
	<header class="relative z-[2] hidden h-[72px] shrink-0 border-b border-white/7 lg:block">
		<div class="mx-auto flex h-full max-w-[1240px] items-center gap-2.5 px-10">
			<AuthLogo large />
			{#if screen !== 'done' && screen !== 'settle'}
				<span class="ml-auto text-[14px] text-white/55">이미 계정이 있나요? <a href="/login" class="font-bold text-accent hover:text-[#ffa06f]"> 로그인</a></span>
			{/if}
		</div>
	</header>

	{#if screen === 'invite' && invite && validity}
		<!-- 초대장 -->
		<div class="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 animate-up-in flex-col lg:max-w-[1120px] lg:px-10 lg:py-20">
			<div class="no-bar min-h-0 flex-1 overflow-y-auto px-6 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:content-center lg:items-center lg:gap-x-24 lg:overflow-visible lg:p-0">
				<div class="flex h-16 items-center lg:hidden"><AuthLogo /></div>

				<div class="mt-7 lg:col-start-1 lg:row-start-1 lg:mt-0">
					<div class="flex items-center gap-4 lg:gap-5">
						<div class="flex h-[52px] w-[52px] shrink-0 animate-pop items-center justify-center rounded-2xl border border-accent/22 bg-accent/10 text-[#ff9a66] lg:h-[84px] lg:w-[84px] lg:rounded-[26px]" aria-hidden="true">
							<svg class="h-6 w-6 lg:h-9 lg:w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
						</div>
						<div class="min-w-0">
							<p class="text-[13px] font-bold text-accent lg:text-[14px]">크리에이터 초대장</p>
							<h1 class="mt-1.5 text-[26px] leading-[1.28] font-extrabold tracking-[-0.03em] lg:mt-2 lg:text-[46px] lg:leading-[1.18] lg:tracking-[-0.035em]">MYR 크리에이터로<br />초대받았어요</h1>
						</div>
					</div>
					<p class="mt-5 text-[15px] leading-[1.65] text-white/62 lg:mt-6 lg:max-w-[500px] lg:text-[17px] lg:leading-[1.7]">{INVITER}이 크리에이터 스튜디오로 초대했어요.<br />계정을 만들면 상품 등록부터 오픈, 주문 관리까지 바로 시작할 수 있어요.</p>
				</div>

				<!-- 초대 정보 — 모바일은 소개 아래 · PC 는 오른쪽 카드 -->
				<div class="mt-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-9 lg:shadow-[0_30px_80px_rgba(0,0,0,.35)]">
					<p class="hidden text-[14px] font-extrabold text-white/60 lg:block">초대 정보</p>
					<dl class="rounded-[20px] border border-white/8 bg-white/3 px-[18px] py-1 lg:mt-3.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
						<div class="flex justify-between gap-3 border-b border-white/6 py-[15px] text-[14px] lg:py-[17px] lg:text-[15px]"><dt class="text-white/55">초대받은 이메일</dt><dd class="min-w-0 truncate font-bold">{invite.email}</dd></div>
						<div class="flex justify-between gap-3 border-b border-white/6 py-[15px] text-[14px] lg:py-[17px] lg:text-[15px]"><dt class="text-white/55">초대한 곳</dt><dd class="font-bold">{INVITER}</dd></div>
						<div class="flex justify-between gap-3 py-[15px] text-[14px] lg:py-[17px] lg:text-[15px]"><dt class="text-white/55">링크 유효기간</dt><dd class="font-bold">{validity.until} <span class="text-accent">· {validity.left}</span></dd></div>
					</dl>
					<button type="button" onclick={() => (screen = 'form')} class="{authButton(true)} mt-6 hidden lg:flex">
						초대 수락하고 가입하기
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					</button>
					<p class="mt-4 hidden text-center text-[13px] leading-[1.55] text-white/45 lg:block">초대 링크는 이 이메일로 한 번만 쓸 수 있어요.</p>
				</div>

				<div class="lg:col-start-1 lg:row-start-2">
					<p class="mt-8 mb-3.5 text-[13px] font-extrabold text-white/70 lg:mt-10">가입하면 바로 할 수 있어요</p>
					<ul class="flex flex-col gap-4">
						<li class="flex items-center gap-3.5 lg:gap-4">
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent lg:h-12 lg:w-12 lg:rounded-[14px]" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></svg></span>
							<span><b class="block text-[14px] font-bold lg:text-[15px]">상품 등록 · 샵 오픈</b><span class="mt-[3px] block text-[12px] leading-[1.45] text-white/55 lg:text-[13px]">상세페이지를 쓰면 MYR Shop에 바로 올라가요</span></span>
						</li>
						<li class="flex items-center gap-3.5 lg:gap-4">
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent lg:h-12 lg:w-12 lg:rounded-[14px]" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11l-3-3M20 17H9l3 3" /></svg></span>
							<span><b class="block text-[14px] font-bold lg:text-[15px]">주문 · CS · 정산 관리</b><span class="mt-[3px] block text-[12px] leading-[1.45] text-white/55 lg:text-[13px]">크리에이터 스튜디오 한 곳에서 처리해요</span></span>
						</li>
					</ul>
				</div>
			</div>
			<!-- 모바일 하단 버튼 줄 -->
			<div class="shrink-0 border-t border-white/6 bg-bg px-6 pt-3.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
				<button type="button" onclick={() => (screen = 'form')} class={authButton(true)}>
					초대 수락하고 가입하기
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</button>
				<p class="mt-3.5 text-center text-[13px] text-white/50">이미 계정이 있나요? <a href="/login" class="font-bold text-accent">로그인</a></p>
			</div>
		</div>
	{:else if screen === 'form' && invite}
		<!-- 가입 폼 -->
		<form method="POST" action="?/signup" novalidate use:enhance={submitSignup} class="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 animate-up-in flex-col lg:grid lg:max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_minmax(0,580px)] lg:gap-20 lg:px-10">
			<!-- 모바일 머리 — 뒤로(초대장) -->
			<div class="flex h-[60px] shrink-0 items-center gap-1.5 pr-5 pl-2.5 lg:hidden">
				<button type="button" onclick={() => (screen = 'invite')} aria-label="초대장으로" class="flex h-11 w-11 items-center justify-center rounded-xl text-fg">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				</button>
				<span class="text-[16px] font-bold">크리에이터 가입</span>
			</div>

			<!-- PC 왼쪽 — 실시간 샵 미리보기 -->
			<aside class="hidden lg:sticky lg:top-0 lg:flex lg:h-[calc(100dvh-72px)] lg:flex-col lg:justify-center lg:py-8">
				<button type="button" onclick={() => (screen = 'invite')} class="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-white/55 hover:text-fg">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>초대장으로
				</button>
				<p class="mt-7 text-[14px] font-bold text-accent">크리에이터 가입</p>
				<h1 class="mt-2.5 text-[44px] leading-[1.18] font-extrabold tracking-[-0.035em]">샵에 보일 프로필을<br />만들어요</h1>
				<p class="mt-4 max-w-[460px] text-[16px] leading-[1.7] text-white/60">오른쪽에 입력하는 대로 아래 카드가 바뀌어요.<br />이 모습 그대로 MYR Shop 의 크리에이터 필터와 상품 상세에 보여요.</p>
				<div class="mt-8 max-w-[460px] rounded-[26px] border border-white/8 bg-[#111216] p-7">
					<div class="flex items-center justify-between"><span class="text-[12px] font-bold text-white/45">샵 미리보기</span><span class="flex items-center gap-1.5 text-[11px] text-white/40"><span class="h-1.5 w-1.5 rounded-full bg-mint"></span>실시간</span></div>
					<div class="mt-[18px] flex items-center gap-4">
						<span class="relative h-[72px] w-[72px] shrink-0">
							<span class="flex h-[72px] w-[72px] items-center justify-center rounded-full text-[26px] font-extrabold text-bg transition-colors duration-300" style:background={preview.bg}>{preview.initial}</span>
							<span class="absolute -right-0.5 -bottom-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#111216] bg-[#2a2c33] text-white/85" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
						</span>
						<span class="min-w-0 flex-1">
							<span class="flex min-w-0 items-center gap-2"><span class="truncate text-[22px] font-extrabold tracking-[-0.02em] {preview.named ? 'text-fg' : 'text-white/40'}">{preview.name}</span>{#if preview.platform}<span class="shrink-0 rounded-lg bg-white/8 px-[9px] py-1 text-[12px] font-bold text-white/75">{preview.platform}</span>{/if}</span>
							<span class="mt-1 block text-[14px] text-white/50">@{preview.handle}</span>
						</span>
					</div>
					<p class="mt-[22px] flex items-start gap-2 border-t border-white/7 pt-[18px] text-[13px] leading-[1.5] text-white/55"><svg class="mt-0.5 shrink-0 text-white/65" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>지금은 이니셜로 보여요. 프로필 사진은 로그인 후 바꿀 수 있어요.</p>
				</div>
			</aside>

			<!-- 입력 -->
			<div class="flex min-h-0 flex-1 flex-col lg:min-h-[calc(100dvh-72px)]">
				<div class="no-bar min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-6 lg:overflow-visible lg:px-1 lg:pt-10 lg:pb-7">
					<h1 class="text-[26px] leading-[1.3] font-extrabold tracking-[-0.025em] lg:hidden">샵에 보일 프로필과<br />로그인 정보를 입력해요</h1>

					<!-- 01 로그인 정보 -->
					<p class="mt-7 mb-3 lg:mt-0 lg:mb-3.5 {sectionLabel}">01 · 로그인 정보</p>
					<div class="flex flex-col gap-4 lg:gap-[18px]">
						<div class="flex flex-col gap-2">
							<label for="f-email" class={AUTH_LABEL}>이메일</label>
							<div class="relative">
								<input id="f-email" type="email" value={invite.email} readonly aria-readonly="true" class="{authInput({ filled: true, size: 'md', padRight: true })} text-white/75" />
								<span class="absolute top-1/2 right-4 -translate-y-1/2 text-white/40" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
							</div>
							<p class={AUTH_HINT}>초대받은 이메일이에요. 로그인 아이디와 알림 메일 주소로 쓰여요.</p>
						</div>
						<div class="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
							<div class="flex flex-col gap-2">
								<label for="f-password" class={AUTH_LABEL}>비밀번호</label>
								<div class="relative">
									<input id="f-password" name="password" type={showPw ? 'text' : 'password'} autocomplete="new-password" placeholder="8자 이상" bind:value={values.password} oninput={clearServer('password')} onblur={touch('password')} aria-invalid={shown('password')} aria-describedby={shown('password') ? 'e-password' : undefined} class={authInput({ invalid: shown('password'), filled: !!values.password, size: 'md', padRight: true })} />
									<PasswordToggle bind:shown={showPw} />
								</div>
								{#if shown('password')}<ErrorText id="e-password" text={errText('password')} />{/if}
							</div>
							<div class="flex flex-col gap-2">
								<label for="f-confirm" class={AUTH_LABEL}>비밀번호 확인</label>
								<div class="relative">
									<input id="f-confirm" name="confirm" type={showPw ? 'text' : 'password'} autocomplete="new-password" placeholder="한 번 더 입력" bind:value={values.confirm} onblur={touch('confirm')} aria-invalid={shown('confirm')} aria-describedby={shown('confirm') ? 'e-confirm' : undefined} class={authInput({ invalid: shown('confirm'), filled: !!values.confirm, size: 'md', padRight: true })} />
									{#if confirmOk}<span class="absolute top-1/2 right-4 -translate-y-1/2 text-mint" aria-label="비밀번호가 같아요"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>{/if}
								</div>
								{#if shown('confirm')}<ErrorText id="e-confirm" text={errText('confirm')} />{/if}
							</div>
						</div>
					</div>

					<!-- 02 크리에이터 프로필 -->
					<p class="mt-8 mb-3 lg:mt-9 lg:mb-4 {sectionLabel}">02 · 크리에이터 프로필</p>
					<div class="flex flex-col gap-4 lg:gap-[18px]">
						<div class="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
							<div class="flex flex-col gap-2">
								<label for="f-name" class={AUTH_LABEL}>활동명</label>
								<input id="f-name" name="name" autocomplete="nickname" placeholder="예: 민지 루틴" maxlength={NAME_MAX + 10} bind:value={values.name} oninput={clearServer('name')} onblur={touch('name')} aria-invalid={shown('name')} aria-describedby={shown('name') ? 'e-name' : 'h-name'} class={authInput({ invalid: shown('name'), filled: !!values.name.trim(), size: 'md' })} />
								{#if shown('name')}<ErrorText id="e-name" text={errText('name')} />{:else}<p id="h-name" class={AUTH_HINT}>샵에 크리에이터 이름으로 보여요.</p>{/if}
							</div>
							<div class="flex flex-col gap-2">
								<label for="f-handle" class={AUTH_LABEL}>핸들</label>
								<div class="relative">
									<span class="absolute top-1/2 left-4 -translate-y-1/2 text-[16px] font-bold text-white/40" aria-hidden="true">@</span>
									<input id="f-handle" name="handle" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="minji.routine" maxlength={HANDLE_MAX + 5} value={values.handle} oninput={onHandleInput} oncompositionend={onHandleInput} onblur={onHandleBlur} aria-invalid={shown('handle')} aria-describedby={shown('handle') ? 'e-handle' : 'h-handle'} class={authInput({ invalid: shown('handle'), filled: !!handle, size: 'md', padLeft: true, padRight: true })} />
									{#if checking && checking === handle}<span class="absolute top-1/2 right-4 h-[18px] w-[18px] -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-white/70" aria-hidden="true"></span>{:else if handleOk}<span class="absolute top-1/2 right-4 -translate-y-1/2 text-mint" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>{/if}
								</div>
								{#if shown('handle')}
									<ErrorText id="e-handle" text={errText('handle')} />
								{:else if checking && checking === handle}
									<p id="h-handle" class={AUTH_HINT} role="status">@{handle} 을 쓸 수 있는지 확인하고 있어요…</p>
								{:else if handleOk}
									<p id="h-handle" class="text-[12px] font-semibold text-mint">@{handle} 은 사용할 수 있어요</p>
								{:else}
									<p id="h-handle" class={AUTH_HINT}>영문 소문자 · 숫자 · <b class="text-white/70">.</b> · <b class="text-white/70">_</b> 만 쓸 수 있어요.</p>
								{/if}
							</div>
						</div>

						<div class="flex flex-col gap-2">
							<span id="platform-label" class={AUTH_LABEL}>대표 채널</span>
							<input type="hidden" name="platform" value={values.platform ?? ''} />
							<div id="f-platform" role="radiogroup" aria-labelledby="platform-label" class="grid grid-cols-3 gap-2">
								{#each PLATFORMS as p (p.id)}
									{@const on = values.platform === p.id}
									<button
										type="button"
										role="radio"
										aria-checked={on}
										onclick={() => {
											values.platform = p.id;
											touched.platform = true;
										}}
										class="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] px-1.5 text-[13px] font-bold whitespace-nowrap transition-all lg:h-[52px] lg:text-[14px] {on ? 'border-accent bg-accent/10 text-fg' : 'border-white/10 bg-white/3 text-white/75 hover:border-white/25'}"
									>
										<span class="h-2 w-2 rounded-full" style:background={p.dot} aria-hidden="true"></span>{p.name}
									</button>
								{/each}
							</div>
							{#if shown('platform')}<ErrorText text={errText('platform')} />{/if}
						</div>

						<!-- 모바일 샵 미리보기(작게) -->
						<div class="rounded-[18px] border border-dashed border-white/14 bg-white/3 p-4 lg:hidden">
							<p class="mb-3 text-[11px] font-bold text-white/45">샵에서 이렇게 보여요</p>
							<div class="flex items-center gap-3">
								<span class="relative h-11 w-11 shrink-0">
									<span class="flex h-11 w-11 items-center justify-center rounded-full text-[16px] font-extrabold text-bg transition-colors duration-300" style:background={preview.bg}>{preview.initial}</span>
									<span class="absolute -right-[3px] -bottom-[3px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#121317] bg-[#2a2c33] text-white/85" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
								</span>
								<span class="min-w-0 flex-1">
									<span class="flex min-w-0 items-center gap-1.5"><span class="truncate text-[15px] font-extrabold {preview.named ? 'text-fg' : 'text-white/40'}">{preview.name}</span>{#if preview.platform}<span class="shrink-0 rounded-md bg-white/8 px-[7px] py-[3px] text-[11px] font-bold text-white/75">{preview.platform}</span>{/if}</span>
									<span class="mt-0.5 block text-[12px] text-white/50">@{preview.handle}</span>
								</span>
							</div>
							<p class="mt-3.5 flex items-start gap-1.5 border-t border-white/7 pt-3 text-[12px] leading-[1.5] text-white/50"><svg class="mt-px shrink-0 text-white/60" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>지금은 이니셜로 보여요. 프로필 사진은 로그인 후 바꿀 수 있어요.</p>
						</div>
					</div>

					<!-- 03 연락처 -->
					<p class="mt-8 mb-3 lg:mt-9 lg:mb-4 {sectionLabel}">03 · 연락처</p>
					<div class="flex flex-col gap-2 lg:max-w-[284px]">
						<label for="f-phone" class={AUTH_LABEL}>휴대폰 번호</label>
						<input id="f-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000" maxlength="13" value={values.phone} oninput={onPhoneInput} oncompositionend={onPhoneInput} onblur={touch('phone')} aria-invalid={shown('phone')} aria-describedby={shown('phone') ? 'e-phone' : 'h-phone'} class="{authInput({ invalid: shown('phone'), filled: !!values.phone, size: 'md' })} tabular-nums" />
						{#if shown('phone')}<ErrorText id="e-phone" text={errText('phone')} />{/if}
					</div>
					{#if !shown('phone')}<p id="h-phone" class="mt-2 {AUTH_HINT}">제조 미팅 · 발주 연락에만 쓰고 샵에는 보이지 않아요.</p>{/if}

					<!-- 약관 -->
					<div id="f-terms" class="mt-7 rounded-2xl border bg-white/3 px-4 py-1 lg:mt-8 {termsErr ? 'border-accent' : 'border-white/8'}">
						<div class="border-b border-white/8 py-1">
							<CheckBox size={24} checked={termsAll} onchange={toggleAll}><span class="text-[15px] font-extrabold">모두 동의</span></CheckBox>
						</div>
						{#each TERMS as t (t.id)}
							<div class="flex items-center gap-2">
								<div class="flex-1"><CheckBox size={24} name="agree_{t.id}" bind:checked={values.agreed[t.id]}><span class="text-[14px] text-white/80"><span class="font-bold text-accent">필수</span> {t.name}</span></CheckBox></div>
								<!-- 약관 문서가 확정되면 문서 링크로 -->
								<button type="button" onclick={() => showToast('약관 문서를 준비하고 있어요')} class="shrink-0 py-2 text-[12px] text-white/45 underline underline-offset-2">보기</button>
							</div>
						{/each}
					</div>
					{#if termsErr}<div class="mt-2"><ErrorText text="약관과 개인정보 수집 · 이용에 동의해주세요" /></div>{/if}
				</div>

				<div class="shrink-0 border-t border-white/6 bg-bg px-6 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:border-white/7 lg:px-1 lg:pt-4 lg:pb-7">
					{#if formError}<div class="mb-3"><ErrorText text={formError} /></div>{/if}
					<button type="submit" disabled={busy} aria-busy={busy} class={authButton(missing === 0 && !busy)}>{busy ? '가입하고 있어요…' : submitLabel(missing)}</button>
				</div>
			</div>
		</form>
	{:else if screen === 'settle'}
		<!-- 2단계 — 사업자 · 정산 정보(건너뛸 수 있다 · 0085) -->
		<div class="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-y-auto px-6 pt-10 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:max-w-none lg:items-center lg:overflow-visible lg:px-10 lg:py-16">
			<div class="flex animate-up-in flex-col lg:w-full lg:max-w-[560px] lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-12">
				<p class="text-[13px] font-bold text-accent">가입 완료 · 마지막 단계</p>
				<h1 class="mt-2 text-[26px] leading-[1.3] font-extrabold tracking-[-0.03em] lg:text-[30px]">정산 받을 정보를<br class="lg:hidden" /> 입력해 주세요</h1>
				<p class="mt-2.5 text-[14px] leading-[1.6] text-white/62 lg:text-[15px]">MYR 은 사업자 크리에이터와 함께해요. 지금 넣지 않아도 괜찮아요 — 콘솔 <b class="font-bold text-fg">내 정보</b>에서 언제든 넣을 수 있고, 정보가 확인돼야 정산금이 지급돼요.</p>
				<div class="mt-6">
					<SettleInfoForm info={settleSeed} preview={!!data.preview} submitLabel="저장하고 시작하기" onsaved={() => { screen = 'done'; window.scrollTo(0, 0); showToast(data.preview ? '미리보기라 저장하지 않았어요' : '정산 정보를 저장했어요 · 운영팀이 확인할게요'); }}>
						{#snippet footer()}
							<button type="button" onclick={() => { screen = 'done'; window.scrollTo(0, 0); }} class="h-12 w-full rounded-2xl text-[14px] font-bold text-white/60 hover:text-fg">나중에 입력할게요</button>
						{/snippet}
					</SettleInfoForm>
				</div>
			</div>
		</div>
	{:else if screen === 'done'}
		<!-- 환영 -->
		<div class="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-6 pt-[72px] pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:max-w-none lg:items-center lg:justify-center lg:px-10 lg:py-20">
			<div class="flex flex-1 animate-up-in flex-col lg:w-full lg:max-w-[560px] lg:flex-none lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-12">
				<div class="relative h-[72px] w-[72px] lg:h-[76px] lg:w-[76px]">
					<span class="absolute inset-0 flex animate-pop items-center justify-center rounded-full text-[26px] font-extrabold text-bg" style:background={preview.bg}>{preview.initial}</span>
					<span class="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-bg bg-accent lg:h-[30px] lg:w-[30px] lg:border-[#111216]" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
				</div>
				<h1 class="mt-6 text-[30px] leading-[1.3] font-extrabold tracking-[-0.03em] lg:text-[34px]">{preview.name}님,<br class="lg:hidden" /> 가입을 환영해요</h1>
				<p class="mt-2.5 text-[15px] leading-[1.6] text-white/65 lg:mt-3 lg:text-[16px]">이제 크리에이터 스튜디오에서 첫 상품을 등록할 수 있어요. 다음부터는 <b class="font-bold text-fg">{invite?.email}</b> 과 방금 정한 비밀번호로 로그인해요.</p>
				<dl class="mt-6 rounded-[18px] border border-white/8 bg-white/3 px-4 py-1 lg:px-[18px]">
					<div class="flex justify-between gap-3 border-b border-white/6 py-[13px] text-[14px] lg:py-4 lg:text-[15px]"><dt class="text-white/55">핸들</dt><dd class="font-bold">@{preview.handle}</dd></div>
					<div class="flex justify-between gap-3 border-b border-white/6 py-[13px] text-[14px] lg:py-4 lg:text-[15px]"><dt class="text-white/55">대표 채널</dt><dd class="font-bold">{preview.platform}</dd></div>
					<div class="flex justify-between gap-3 py-[13px] text-[14px] lg:py-4 lg:text-[15px]"><dt class="text-white/55">연락처</dt><dd class="font-bold tabular-nums">{values.phone}</dd></div>
				</dl>
				<!-- 가입 action 이 바로 로그인해 둔다 — 로그인이 실패했으면 로그인 화면으로 -->
				<a href={signedIn ? '/' : '/login'} class="{authButton(true)} mt-auto lg:mt-6">
					{signedIn ? '크리에이터 스튜디오로' : '로그인하러 가기'}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</a>
			</div>
		</div>
	{:else}
		<!-- 만료 -->
		<div class="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:max-w-none lg:items-center lg:justify-center lg:px-10 lg:py-20">
			<div class="flex h-16 items-center lg:hidden"><AuthLogo /></div>
			<div class="flex flex-1 animate-up-in flex-col lg:w-full lg:max-w-[520px] lg:flex-none lg:items-center lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-12 lg:text-center">
				<div class="mt-14 flex h-[60px] w-[60px] items-center justify-center rounded-[20px] bg-white/6 text-white/70 lg:mt-0 lg:h-16 lg:w-16" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></div>
				{#if closedReason === 'USED'}
					<h1 class="mt-[22px] text-[28px] leading-[1.3] font-extrabold tracking-[-0.03em] lg:text-[34px]">이미 가입을 마친<br class="lg:hidden" /> 초대 링크예요</h1>
					<p class="mt-3 text-[15px] leading-[1.6] text-white/62 lg:text-[16px]">이 링크로 크리에이터 가입이 끝났어요. 초대받은 이메일과 가입 때 정한 비밀번호로 로그인해주세요.</p>
					<div class="mt-auto w-full lg:mt-8">
						<a href="/login" class={authButton(true)}>로그인하러 가기</a>
						<p class="mt-4 text-center text-[13px] text-white/50">비밀번호가 기억나지 않으면 <a href="/password" class="font-bold text-accent">비밀번호 찾기</a></p>
					</div>
				{:else}
				<h1 class="mt-[22px] text-[28px] leading-[1.3] font-extrabold tracking-[-0.03em] lg:text-[34px]">초대 링크가 만료됐어요</h1>
				<p class="mt-3 text-[15px] leading-[1.6] text-white/62 lg:text-[16px]">초대 링크는 보낸 날부터 {INVITE_DAYS}일 동안만 열리고, <br/> 가입에 한 번 쓰면 다시 열 수 없어요.<br class="" /> 다시 초대받았다면 가장 최근 메일의 링크를 열어주세요.<br/> 새 초대를 요청하면 같은 이메일로 다시 보내드려요.</p>
				<form
					method="POST"
					action="?/request"
					class="mt-auto flex w-full flex-col gap-2.5 lg:mt-8"
					use:enhance={() =>
						async ({ result }) => {
							if (result.type === 'success' && result.data?.requested) showToast('MYR 파트너팀에 새 초대를 요청했어요');
							else showToast('지금은 요청을 받을 수 없어요 — MYR 파트너팀에 직접 연락해주세요');
						}}
				>
					<button type="submit" class={authButton(true)}>새 초대 요청하기</button>
					<!-- PC 는 상단 머리에 같은 로그인 링크가 있어 숨긴다 -->
					<p class="mt-1.5 text-center text-[13px] text-white/50 lg:hidden">이미 계정이 있나요? <a href="/login" class="font-bold text-accent">로그인</a></p>
				</form>
				{#if form && 'requested' in form && form.requested === false}<p class="mt-3 text-center text-[13px] text-white/55">지금은 요청을 받을 수 없어요 — MYR 파트너팀에 직접 연락해주세요</p>{/if}
				{/if}
			</div>
		</div>
	{/if}

	<AuthToast message={toast} bottom={screen === 'form' || screen === 'invite' ? 'bottom-[104px] lg:bottom-8' : 'bottom-7'} />
</div>
