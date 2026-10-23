<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { applyAction } from '$app/forms';
	import { pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { newEventId, track } from '$lib/meta-pixel';
	import { formatPhone, PHONE_RE } from '$lib/utils/phone';
	import Landing from './Landing.svelte';
	import MobileHeader from './funnel/MobileHeader.svelte';
	import Rail from './funnel/Rail.svelte';
	import DesktopBar from './funnel/DesktopBar.svelte';
	import TileStep from './funnel/TileStep.svelte';
	import IngredientStep from './funnel/IngredientStep.svelte';
	import ContactStep from './funnel/ContactStep.svelte';
	import DoneStep from './funnel/DoneStep.svelte';
	import { bodyCls, type RailItem, type Step } from './funnel/shared';
	import {
		CATEGORIES,
		DOSAGE_FORMS,
		FLAVORS,
		FLAVOR_SWATCH,
		MIN_QTY,
		OPTION_DESC,
		SUB_STEP_COPY,
		UNSURE,
		needsFlavor,
		packagingOptionsFor,
		subTypesFor,
		type ApplyErrors,
		type ApplyResult,
		type ApplyValues
	} from '$lib/utils/apply-options';

	/* 한 화면 한 질문 퍼널 — 첫 화면(intro)이 랜딩 슬라이드다. 타일을 고르면 0.28초 뒤 다음 단계로 넘어가고, 헤더의 뒤로 가기로 되돌아온다.
	   앞으로 갈 때는 새 화면이 오른쪽에서, 되돌아갈 때는 왼쪽에서 들어온다(setStep 이 방향을 정한다).
	   답은 전부 이 컴포넌트 상태에 모아 두었다가 마지막(연락처) 단계의 <form> 에서 hidden input 으로 한 번에 POST 한다.
	   여기는 상태 머신(답 · 단계 순서 · 이동 · 제출 결과)과 셸 배치만 맡고, 화면은 funnel/ 의 컴포넌트들이 그린다. */

	export type { Step } from './funnel/shared';

	let { form, startStep = 'intro' }: { form: ApplyResult; startStep?: Step } = $props();

	// JS 없이 제출된 결과(form)로 딱 한 번 복원한다 — 이후 결과는 use:enhance 콜백에서 직접 다룬다
	const v0 = untrack(() => form?.values);
	let name = $state(v0?.name ?? '');
	let phone = $state(v0?.phone ?? '');
	let category = $state(v0?.category ?? '');
	let ingredient = $state(v0?.ingredient ?? '');
	let dosageForm = $state(v0?.dosageForm ?? '');
	let subType = $state(v0?.subType ?? '');
	let packaging = $state(v0?.packaging ?? '');
	let flavor = $state(v0?.flavor ?? '');
	let note = $state(v0?.note ?? '');
	let slot = $state(v0?.slot ?? '');
	let agree = $state(false);

	// ── 답 보존(sessionStorage) ──────────────────────────────
	// 새로고침·인앱 브라우저의 재로드(다른 앱 갔다 오면 페이지를 다시 그리는 일이 잦다)에도 고른 답이 남게 한다.
	// 탭 단위라 탭·브라우저를 닫으면 지워지고 다른 탭과 공유되지 않는다. 선택형 답 8개와 있던 단계만 — 이름·연락처·동의는 개인정보라 저장하지 않고,
	// 접수에 성공하면 바로 지운다. 복원은 하이드레이션 뒤(onMount)에 해서 서버가 그린 화면과 어긋나지 않게 한다.
	const SAVE_KEY = 'myr-apply-v1';
	type Saved = Partial<Pick<ApplyValues, 'category' | 'ingredient' | 'dosageForm' | 'subType' | 'packaging' | 'flavor' | 'note' | 'slot'> & { step: Step }>;
	function loadSaved(): Saved {
		try {
			return JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? '{}') as Saved;
		} catch {
			return {};
		}
	}
	function clearSaved() {
		try {
			sessionStorage.removeItem(SAVE_KEY);
		} catch {
			/* 저장소가 막힌 환경(시크릿 · 차단) — 보존 없이 진행 */
		}
	}
	let restored = $state(false);
	onMount(() => {
		// JS 없이 제출된 결과(form)로 복원했으면 그쪽이 더 최신이다
		if (!v0) {
			const s = loadSaved();
			category = s.category ?? '';
			ingredient = s.ingredient ?? '';
			dosageForm = s.dosageForm ?? '';
			subType = s.subType ?? '';
			packaging = s.packaging ?? '';
			flavor = s.flavor ?? '';
			note = s.note ?? '';
			slot = s.slot ?? '';
			// 있던 질문으로 바로 — 랜딩·완료는 제외하고, 지금 답으로 만들어지는 질문 목록에 있는 단계만
			if (s.step && s.step !== 'intro' && s.step !== 'done' && steps.includes(s.step)) applyStep(s.step);
		}
		restored = true;
	});
	$effect(() => {
		const data: Saved = { step, category, ingredient, dosageForm, subType, packaging, flavor, note, slot };
		// 복원 전에는 빈 초기값으로 덮어쓰지 않고, 완료 뒤에는 남기지 않는다
		if (!restored || step === 'done') return;
		try {
			sessionStorage.setItem(SAVE_KEY, JSON.stringify(data));
		} catch {
			/* 저장 실패는 무시 */
		}
	});

	let submitting = $state(false);
	let errors = $state<ApplyErrors>(untrack(() => form?.errors ?? {}));
	// 서버에 닿지 못했거나(네트워크) 서버가 예외를 낸 경우(500) — 연락처 화면에 배너만 띄운다
	let submitError = $state('');
	const formError = $derived(errors.form ?? submitError);

	// 서버가 돌려준 필드 오류 → 그 질문이 있는 단계
	const STEP_OF: Record<string, Step> = {
		category: 'category',
		ingredient: 'ingredient',
		note: 'ingredient',
		dosageForm: 'form',
		subType: 'sub',
		packaging: 'package',
		name: 'contact',
		phone: 'contact',
		agree: 'contact'
	};
	function stepOfErrors(e: ApplyErrors): Step | null {
		if (e.form) return 'contact';
		const key = (Object.keys(STEP_OF) as (keyof ApplyErrors)[]).find((k) => e[k]);
		return key ? STEP_OF[key] : null;
	}

	let step = $state<Step>(untrack(() => (form?.success ? 'done' : (stepOfErrors(form?.errors ?? {}) ?? startStep))));

	// ── 단계 구성 ─────────────────────────────────────────────
	const subOptions = $derived(subTypesFor(dosageForm));
	const packagingOptions = $derived(packagingOptionsFor(dosageForm));
	const flavorNeeded = $derived(needsFlavor(dosageForm, subType));
	const steps = $derived.by(() => {
		const s: Step[] = ['intro', 'category', 'ingredient', 'form'];
		if (subOptions.length > 0) s.push('sub'); // 알약 · 캔디만
		if (packagingOptions.length > 1) s.push('package'); // 하나뿐이면(젤리 → 스틱) 묻지 않고 자동으로 채운다
		if (flavorNeeded) s.push('flavor');
		s.push('contact', 'done');
		return s;
	});
	const questions = $derived<Step[]>(steps.filter((s) => s !== 'intro' && s !== 'done'));
	const qi = $derived(questions.indexOf(step) + 1);
	const q = (st: Step) => `Q${questions.indexOf(st) + 1}`;
	const showHeader = $derived(step !== 'intro' && step !== 'done');

	// ── 표시용 ───────────────────────────────────────────────
	const shown = (v: string) => (v && v !== UNSURE ? v : '');
	const pickedIngredients = $derived(
		ingredient
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	const trail = $derived([category, shown(dosageForm), shown(subType), shown(packaging)].filter(Boolean).join('  ·  '));
	const subCopy = $derived(SUB_STEP_COPY[dosageForm] ?? SUB_STEP_COPY['알약']);
	const packageHelper = $derived(shown(dosageForm) ? `${dosageForm} 제형에 맞는 포장만 보여드려요` : '탭하면 바로 다음으로 넘어가요');

	// 데스크톱 사이드 레일 — 질문 목록에 번호 · 제목 · 고른 값. 지난 질문과 현재 질문은 눌러 이동할 수 있고,
	// 앞 질문도 그 앞의 질문이 전부 답해져 있으면(메인 성분은 선택이라 항상 통과) 눌러서 갈 수 있다. 그 외는 잠근다.
	// 접수가 끝나면(done) 보낸 내용을 다시 고치러 들어가지 못하게 전부 잠근다 — 표시는 "완료"로 채운 채.
	const RAIL_TITLE: Record<string, string> = { category: '카테고리', ingredient: '메인 성분', form: '제형', package: '패키지', flavor: '맛', contact: '연락처' };
	const answerOf: Partial<Record<Step, () => string>> = {
		category: () => category,
		form: () => dosageForm,
		sub: () => subType,
		package: () => packaging,
		flavor: () => flavor
	};
	const rail = $derived.by<RailItem[]>(() => {
		const cur = questions.indexOf(step);
		const vals: Record<string, string> = {
			category,
			ingredient: pickedIngredients.join(', '),
			form: shown(dosageForm),
			sub: shown(subType),
			package: dosageForm === '필름' ? '' : shown(packaging),
			flavor: shown(flavor),
			contact: name.trim()
		};
		const raw: Record<string, string> = { form: dosageForm, sub: subType, package: packaging, flavor };
		const answered = (st: Step) => st === 'ingredient' || st === 'contact' || (answerOf[st]?.() ?? '') !== '';
		return questions.map((st, i) => {
			const on = st === step;
			const past = step === 'done' || i < cur;
			const reachable = questions.slice(0, i).every(answered);
			return {
				step: st,
				n: String(i + 1).padStart(2, '0'),
				title: st === 'sub' ? subCopy.eyebrow : RAIL_TITLE[st],
				value: vals[st] || (raw[st] === UNSURE ? '미팅 때 결정' : past ? '건너뜀' : on ? '진행 중' : ''),
				on,
				past,
				// 타일을 탭한 순간(넘어가기 전 0.28초) 번호 원이 먼저 채워지도록 — 지금 질문이라도 답이 있으면 채운다
				filled: past || vals[st] !== '' || raw[st] === UNSURE,
				locked: step === 'done' || (!past && !on && !reachable),
				dim: !past && !on && !reachable
			};
		});
	});
	const stepLabel = $derived(step === 'done' ? '완료' : `${qi} / ${questions.length}`);

	// 이전으로 돌아왔을 때 — 들어온 순간 이미 답이 있던 질문이면 [다음] 을 보여 준다.
	// 방금 탭해서 자동으로 넘어가는 0.28초 동안 버튼이 깜빡 나타나지 않도록, 지금 값이 아니라 "들어올 때 값"을 본다.
	let enteredAnswered = $state(false);
	$effect(() => {
		const read = answerOf[step];
		enteredAnswered = untrack(() => (read ? read() !== '' : false));
	});

	// ── 이동 ─────────────────────────────────────────────────
	// 전환 방향 — 앞으로 가면 새 화면이 오른쪽에서, [이전]·레일로 되돌아가면 왼쪽에서 들어온다. 단계 순서(steps)의 앞뒤로 정한다
	let dir = $state<1 | -1>(1);
	// 타일 자동 전진(advance · 0.28초 뒤 go(1)) 예약 — 어떤 경로로든 단계가 바뀌면 지운다.
	// 안 지우면 타일을 탭한 직후 [이전]·레일을 눌렀을 때 타이머가 뒤늦게 발사돼 [이전]은 취소되고 레일 점프는 한 단계 더 넘어간다
	let advanceTimer: ReturnType<typeof setTimeout> | undefined;
	// 화면만 바꾼다 — 히스토리는 건드리지 않는다(뒤로가기로 되돌아올 때도 이걸 쓴다)
	function applyStep(next: Step) {
		clearTimeout(advanceTimer);
		if (next === step) return;
		dir = steps.indexOf(next) < steps.indexOf(step) ? -1 : 1;
		step = next;
	}
	// 사용자가 움직인 단계 전환 — 화면을 바꾸고 브라우저 히스토리에 항목을 하나 쌓는다(URL 은 그대로 · SvelteKit shallow routing).
	// 그래야 광고로 들어온 모바일에서 뒤로가기(안드로이드 제스처 · iOS 스와이프백)가 사이트 이탈이 아니라 "이전 질문"이 된다.
	// replace 는 접수 완료처럼 "되돌아가면 안 되는" 전환 — 연락처 항목을 완료로 덮어 뒤로가기가 채워진 폼으로 가서 재접수되지 않게
	function setStep(next: Step, mode: 'push' | 'replace' = 'push') {
		if (next === step) {
			clearTimeout(advanceTimer);
			return;
		}
		applyStep(next);
		if (browser) (mode === 'replace' ? replaceState : pushState)('', { step: next });
	}
	// 뒤로/앞으로 가기 — SvelteKit 이 popstate 를 받아 page.state 를 그 항목의 값으로 되돌리면 그 단계로 화면을 맞춘다.
	// 첫 실행(초기값)은 건너뛴다 — JS 없이 제출된 결과(form)로 복원한 단계를 덮어쓰지 않게. 항목에 단계가 없으면(= 처음 들어온 항목) 시작 단계
	let histStep: Step | undefined | null = null;
	$effect(() => {
		const s = page.state.step;
		if (histStep === null) {
			histStep = s;
			return;
		}
		if (s === histStep) return;
		histStep = s;
		untrack(() => applyStep(s && steps.includes(s) ? s : startStep));
	});
	function go(delta: number) {
		const i = Math.max(0, steps.indexOf(step));
		setStep(steps[Math.max(0, Math.min(steps.length - 1, i + delta))]);
	}
	function advance() {
		clearTimeout(advanceTimer);
		advanceTimer = setTimeout(() => go(1), 280);
	}
	$effect(() => () => clearTimeout(advanceTimer));

	// ── 선택 처리 ─────────────────────────────────────────────
	function pickCategory(v: string) {
		category = v;
		advance();
	}
	function pickForm(v: string) {
		dosageForm = v;
		subType = '';
		const o = packagingOptionsFor(v);
		packaging = o.length === 1 ? o[0] : o.includes(packaging) ? packaging : '';
		if (!needsFlavor(v, '')) flavor = '';
		advance();
	}
	function pickSub(v: string) {
		subType = v;
		if (!needsFlavor(dosageForm, v)) flavor = '';
		advance();
	}
	function pickPackage(v: string) {
		packaging = v;
		advance();
	}
	function pickFlavor(v: string) {
		flavor = v;
		advance();
	}
	// 랜딩 카테고리 타일 → 그 카테고리가 골라진 채로 첫 질문부터
	function startWith(cat: string) {
		category = cat;
		setStep('category');
	}

	// ── 연락처 · 제출 ─────────────────────────────────────────
	const digits = $derived(phone.replace(/\D/g, ''));
	// 서버(apply-action.ts)와 같은 규칙 — 01x 로 시작하는 휴대폰 번호만
	const phoneOk = $derived(PHONE_RE.test(formatPhone(phone)));
	const canSubmit = $derived(name.trim() !== '' && phoneOk && agree);

	// 제출 버튼은 항상 눌리게 두고, 빠진 게 있으면 서버와 같은 문구로 그 칸 아래에 안내한다 — 동의 없이 눌렀을 때 "왜 안 되지?" 가 없도록
	function validateContact(): ApplyErrors {
		const e: ApplyErrors = {};
		if (!name.trim()) e.name = '활동명 또는 채널을 입력해주세요.';
		if (!digits) e.phone = '연락처를 입력해주세요.';
		else if (!phoneOk) e.phone = '연락처는 010-0000-0000 형식으로 입력해주세요.';
		if (!agree) e.agree = '개인정보 수집에 동의해주세요.';
		return e;
	}
	// 고치면 그 칸의 안내는 바로 지운다
	$effect(() => {
		if (agree) untrack(() => errors.agree && (errors = { ...errors, agree: undefined }));
	});
	$effect(() => {
		if (name.trim()) untrack(() => errors.name && (errors = { ...errors, name: undefined }));
	});
	$effect(() => {
		if (phoneOk) untrack(() => errors.phone && (errors = { ...errors, phone: undefined }));
	});

	// 메타 ViewContent — 랜딩에서 퍼널로 처음 들어온 순간 1회
	let funnelTracked = false;
	$effect(() => {
		if (step !== 'intro' && step !== 'done' && !funnelTracked) {
			funnelTracked = true;
			track('ViewContent', { content_name: 'oem_funnel' });
		}
	});

	/** 연락처 <form> 의 use:enhance — 빠진 칸이 있으면 서버로 보내지 않고 안내 + 첫 번째 빈 칸으로 포커스·스크롤, 결과는 단계 전환으로 반영 */
	const submit: SubmitFunction = ({ cancel, formData }) => {
		const missing = validateContact();
		if (Object.keys(missing).length > 0) {
			errors = { ...errors, ...missing };
			cancel();
			// 활동명 · 연락처 · 동의 순으로 첫 번째 빈 칸에 커서를 옮긴다(모바일은 키보드가 바로 뜬다).
			// 버튼이 아래 고정이라 안내가 화면 밖에 있을 수 있으니 그 칸(동의는 상자 전체)이 가운데 오게 스크롤
			const first = (['name', 'phone', 'agree'] as const).find((k) => missing[k])!;
			tick().then(() => {
				document.getElementById(first)?.focus({ preventScroll: true });
				document.getElementById(first === 'agree' ? 'agree-box' : first)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			});
			return;
		}
		submitting = true;
		submitError = '';
		// 메타 전환 — 픽셀(Lead)과 서버 전환 API 가 같은 event_id 를 써서 중복 제거
		const eventId = newEventId();
		formData.set('event_id', eventId);
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'success') {
				errors = {};
				clearSaved();
				setStep('done', 'replace');
				track('Lead', { content_name: 'oem_apply', content_category: category }, eventId);
			} else if (result.type === 'failure') {
				errors = (result.data?.errors as ApplyErrors | undefined) ?? {};
				const target = stepOfErrors(errors);
				setStep(target && steps.includes(target) ? target : 'contact');
			} else if (result.type === 'error') {
				// 기본 에러 페이지로 넘어가면 입력값이 날아간다 — 폼을 그대로 두고 배너만
				submitError = '일시적인 오류가 났어요. 잠시 후 다시 시도해주세요';
			} else {
				await applyAction(result);
			}
		};
	};
	// 앞 단계에서 모은 답 — 연락처 화면의 hidden input 으로 한 번에 보낸다
	const hidden = $derived({
		category,
		ingredient,
		dosageForm,
		subType,
		packaging,
		flavor: flavorNeeded ? flavor : '',
		note,
		slot
	});

	// ── 완료 ─────────────────────────────────────────────────
	const UNDECIDED = '미팅 때 결정';
	const NA = '해당 없음';
	const ANY = '상관없음';
	const summary = $derived.by(() => {
		const formText = shown(dosageForm) ? `${dosageForm}${shown(subType) ? ` · ${subType}` : ''}` : '';
		const rows = [
			{ k: '카테고리', v: category || UNDECIDED },
			{ k: '메인 성분', v: pickedIngredients.join(', ') || UNDECIDED },
			{ k: '제형', v: formText || UNDECIDED },
			{ k: '패키지', v: dosageForm === '필름' ? NA : shown(packaging) || UNDECIDED },
			{ k: '맛', v: flavorNeeded ? shown(flavor) || UNDECIDED : NA },
			{ k: '미팅 시간대', v: slot || ANY }
		];
		return rows.map((r) => ({ ...r, muted: r.v === UNDECIDED || r.v === NA || r.v === ANY }));
	});

	// 완료 화면의 [홈으로] — 답을 비우고 랜딩 첫 장으로
	function restart() {
		name = phone = category = ingredient = dosageForm = subType = packaging = flavor = note = slot = '';
		agree = false;
		errors = {};
		submitError = '';
		clearSaved();
		setStep('intro');
	}
	// 레일의 로고 — 랜딩으로만 간다. 답은 그대로 두어 실수로 눌러도 입력이 날아가지 않게(다시 시작하면 고른 값이 채워진 채 이어진다).
	// 접수가 끝난 뒤에는 같은 답으로 또 접수되지 않도록 [홈으로]와 같이 비운다
	function home() {
		if (step === 'done') restart();
		else setStep('intro');
	}
</script>

<main class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg md:border-x md:border-line lg:max-w-none lg:border-0">
	{#if step === 'intro'}
		<Landing onstart={() => setStep('category')} onpick={startWith} />
	{:else}
		<div class="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
			{#if showHeader}
				<MobileHeader {questions} {qi} {trail} onback={() => go(-1)} />
			{/if}
			<Rail items={rail} {questions} {qi} done={step === 'done'} {stepLabel} onrestart={home} ongo={setStep} />

			<div class="flex min-h-0 flex-1 flex-col">
				<DesktopBar {trail} showBack={step !== 'done'} onback={() => go(-1)} />
				{#key step}
					<section class="flex min-h-0 flex-1 flex-col {dir < 0 ? 'motion-safe:animate-step-back' : 'motion-safe:animate-step'}">
						{#if step === 'category'}
							<TileStep
								eyebrow="{q('category')} · 카테고리"
								title={['어떤 웰니스 제품을', '만들고 싶으세요?']}
								help="가장 가까운 하나를 골라주세요. 탭하면 바로 넘어가요."
								options={CATEGORIES}
								value={category}
								label="카테고리"
								desc={OPTION_DESC}
								error={errors.category}
								showNext={enteredAnswered}
								onpick={pickCategory}
								onnext={() => go(1)}
							>
								<!-- 최소 제작 수량 안내 — 옛 인트로 카드의 문구 그대로, 시작 전에 알 수 있게 첫 질문에 둔다 -->
								<div class="mt-4 flex items-center gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-[18px] py-3 text-sm text-fg/85 md:mt-6 md:py-4 {bodyCls} lg:mt-7">
									<svg class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
									<span><b class="font-bold text-fg">최소 제작 수량 {MIN_QTY.toLocaleString('ko-KR')}개</b> — 제형 및 패키지 형태에 따라 달라 질 수 있습니다.</span>
								</div>
							</TileStep>
						{:else if step === 'ingredient'}
							<IngredientStep q={q('ingredient')} {category} bind:ingredient bind:note onnext={() => go(1)} />
						{:else if step === 'form'}
							<TileStep
								eyebrow="{q('form')} · 제형"
								title={['어떤 형태로', '먹게 하고 싶으세요?']}
								help="제형에 따라 패키지 선택지가 달라져요"
								options={DOSAGE_FORMS}
								value={dosageForm}
								label="제형"
								layout="grid-lg"
								desc={OPTION_DESC}
								error={errors.dosageForm}
								unsure
								showNext={enteredAnswered}
								onpick={pickForm}
								onnext={() => go(1)}
							/>
						{:else if step === 'sub'}
							<TileStep
								eyebrow="{q('sub')} · {subCopy.eyebrow}"
								title={subCopy.title}
								help={subCopy.help}
								options={subOptions}
								value={subType}
								label={subCopy.eyebrow}
								layout="row"
								desc={OPTION_DESC}
								error={errors.subType}
								unsure
								showNext={enteredAnswered}
								onpick={pickSub}
								onnext={() => go(1)}
							/>
						{:else if step === 'package'}
							<TileStep
								eyebrow="{q('package')} · 패키지"
								title={['팔로워 손에', '어떻게 들려 있을까요?']}
								help={packageHelper}
								options={packagingOptions}
								value={packaging}
								label="패키지"
								layout="row"
								desc={OPTION_DESC}
								error={errors.packaging}
								unsure
								showNext={enteredAnswered}
								onpick={pickPackage}
								onnext={() => go(1)}
							/>
						{:else if step === 'flavor'}
							<TileStep
								eyebrow="{q('flavor')} · 맛"
								title={['첫 맛은', '무엇으로 할까요?']}
								help="탭하면 바로 다음으로 넘어가요"
								options={FLAVORS}
								value={flavor}
								label="맛"
								layout="swatch"
								swatch={FLAVOR_SWATCH}
								unsure
								showNext={enteredAnswered}
								onpick={pickFlavor}
								onnext={() => go(1)}
							/>
						{:else if step === 'contact'}
							<ContactStep {hidden} bind:name bind:phone bind:slot bind:agree {errors} {formError} {submitting} {canSubmit} {submit} />
						{:else}
							<DoneStep {name} {summary} onrestart={restart} />
						{/if}
					</section>
				{/key}
			</div>
		</div>
	{/if}
</main>
