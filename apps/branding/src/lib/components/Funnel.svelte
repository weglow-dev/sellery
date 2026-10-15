<script lang="ts">
	import { untrack } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import Landing from './Landing.svelte';
	import TileGroup from './TileGroup.svelte';
	import {
		CATEGORIES,
		DOSAGE_FORMS,
		FLAVORS,
		FLAVOR_SWATCH,
		MEETING_SLOTS,
		MIN_QTY,
		OPTION_DESC,
		SUB_STEP_COPY,
		SUGGESTED_INGREDIENTS,
		UNSURE,
		UNSURE_LABEL,
		needsFlavor,
		packagingOptionsFor,
		subTypesFor,
		type ApplyErrors,
		type ApplyResult,
		type Category
	} from '$lib/utils/apply-options';
	import { formatPhone } from '$lib/utils/phone';

	/* 한 화면 한 질문 퍼널 — 첫 화면(intro)이 랜딩 슬라이드다. 타일을 고르면 0.28초 뒤 다음 단계로 넘어가고, 헤더의 뒤로 가기로 되돌아온다.
	   답은 전부 이 컴포넌트 상태에 모아 두었다가 마지막(연락처) 단계의 <form> 에서 hidden input 으로 한 번에 POST 한다. */

	export type Step = 'intro' | 'category' | 'ingredient' | 'form' | 'sub' | 'package' | 'flavor' | 'contact' | 'done';

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

	let submitting = $state(false);
	let errors = $state<ApplyErrors>(untrack(() => form?.errors ?? {}));
	// 서버에 닿지 못했거나(네트워크) 서버가 예외를 낸 경우(500) — 연락처 화면에 배너만 띄운다
	let submitError = $state('');
	const formError = $derived(errors.form ?? submitError);

	// 서버가 돌려준 필드 오류 → 그 질문이 있는 단계
	const STEP_OF: Record<string, Step> = {
		category: 'category',
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

	// 데스크톱 사이드 레일 — 질문 목록에 번호 · 제목 · 고른 값. 지난 질문과 현재 질문은 눌러 이동할 수 있고,
	// 앞 질문도 그 앞의 질문이 전부 답해져 있으면(메인 성분은 선택이라 항상 통과) 눌러서 갈 수 있다. 그 외는 잠근다.
	const RAIL_TITLE: Record<string, string> = { category: '카테고리', ingredient: '메인 성분', form: '제형', package: '패키지', flavor: '맛', contact: '연락처' };
	const rail = $derived.by(() => {
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
				locked: !past && !on && !reachable
			};
		});
	});
	const stepLabel = $derived(step === 'done' ? '완료' : `${qi} / ${questions.length}`);

	// 이전으로 돌아왔을 때 — 들어온 순간 이미 답이 있던 질문이면 [다음] 을 보여 준다.
	// 방금 탭해서 자동으로 넘어가는 0.28초 동안 버튼이 깜빡 나타나지 않도록, 지금 값이 아니라 "들어올 때 값"을 본다.
	const answerOf: Partial<Record<Step, () => string>> = {
		category: () => category,
		form: () => dosageForm,
		sub: () => subType,
		package: () => packaging,
		flavor: () => flavor
	};
	let enteredAnswered = $state(false);
	$effect(() => {
		const read = answerOf[step];
		enteredAnswered = untrack(() => (read ? read() !== '' : false));
	});

	function go(delta: number) {
		const i = Math.max(0, steps.indexOf(step));
		step = steps[Math.max(0, Math.min(steps.length - 1, i + delta))];
	}
	let advanceTimer: ReturnType<typeof setTimeout> | undefined;
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
		step = 'category';
	}

	// 카테고리별 성분 제안 칩 — 쉼표로 이어 붙이고, 다시 누르면 뺀다
	const suggestions = $derived(SUGGESTED_INGREDIENTS[category as Category] ?? []);
	const pickedIngredients = $derived(
		ingredient
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	function toggleIngredient(label: string) {
		const cur = [...pickedIngredients];
		const i = cur.indexOf(label);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(label);
		ingredient = cur.join(', ');
	}

	// ── 표시용 ───────────────────────────────────────────────
	const shown = (v: string) => (v && v !== UNSURE ? v : '');
	const trail = $derived([category, shown(dosageForm), shown(subType), shown(packaging)].filter(Boolean).join('  ·  '));
	const subCopy = $derived(SUB_STEP_COPY[dosageForm] ?? SUB_STEP_COPY['알약']);
	const packageHelper = $derived(shown(dosageForm) ? `${dosageForm} 제형에 맞는 포장만 보여드려요` : '탭하면 바로 다음으로 넘어가요');

	const digits = $derived(phone.replace(/\D/g, ''));
	const canSubmit = $derived(name.trim() !== '' && digits.length >= 10 && agree);

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
		step = 'intro';
	}

	const eyebrowCls = 'text-[13px] font-bold text-accent';
	const h1Cls = 'mt-2 text-[27px] leading-[1.34] font-extrabold tracking-[-0.025em] text-fg lg:text-4xl lg:leading-[1.25] lg:tracking-[-0.03em]';
	const helperCls = 'mt-2.5 text-[15px] text-fg/60 lg:mt-3 lg:text-base';
	const labelCls = 'text-sm font-semibold text-fg/80';
	const inputCls =
		'w-full rounded-[14px] border-[1.5px] border-white/10 bg-white/[0.04] px-4 text-[16px] text-fg transition placeholder:text-white/[0.34] focus:border-accent focus:bg-accent/[0.06] focus:outline-none';
	const errCls = 'mt-2 text-xs text-accent';
	const ctaOn =
		'flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-extrabold text-bg transition hover:bg-accent-deep active:scale-[0.98] lg:h-14 lg:w-[260px]';
	const ctaOff =
		'flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.08] text-[17px] font-extrabold text-fg transition active:scale-[0.98] lg:h-14 lg:w-[260px]';
	// 단계 화면 공통 — 내부 세로 스크롤, 아래 버튼은 고정 · 질문 본문은 데스크톱에서 900px 까지.
	// 데스크톱 푸터는 본문과 같은 폭(900px + 좌우 여백 56px)으로 묶고 그 안에서 오른쪽 정렬 — 버튼이 화면 끝이 아니라 입력란 끝선에 온다
	const scrollCls = 'no-scrollbar flex-1 overflow-y-auto px-5 pt-2 pb-7 lg:px-14 lg:pb-12';
	const footCls = 'shrink-0 px-5 pt-3 pb-7 lg:flex lg:w-full lg:max-w-[1012px] lg:flex-col lg:items-end lg:px-14 lg:pb-9';
	const bodyCls = 'lg:max-w-[900px]';
</script>

{#snippet unsureButton(on: boolean, onclick: () => void)}
	<button
		type="button"
		aria-pressed={on}
		{onclick}
		class="mt-3 min-h-[52px] w-full rounded-2xl border-[1.5px] border-dashed lg:mt-3.5 lg:max-w-[900px] text-[15px] font-semibold text-fg/75 transition active:scale-[0.98] {on
			? 'border-accent bg-accent/10'
			: 'border-white/[0.18] hover:border-white/30'}"
	>
		{UNSURE_LABEL}
	</button>
{/snippet}

{#snippet check(size: number)}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
{/snippet}

{#snippet nextFoot()}
	{#if enteredAnswered}
		<div class={footCls}>
			<button type="button" onclick={() => go(1)} class={ctaOn}>
				<span>다음</span>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			</button>
		</div>
	{/if}
{/snippet}

<main class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg md:border-x md:border-line lg:max-w-none lg:border-0">
	{#if step === 'intro'}
		<Landing onstart={() => (step = 'category')} onpick={startWith} />
	{:else}
	<div class="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
	{#if showHeader}
		<!-- 모바일 헤더 — 뒤로 · 진행 세그먼트 · n/N · 고른 경로 -->
		<header class="flex h-[84px] shrink-0 flex-col pt-1.5 pr-4 pl-1.5 lg:hidden">
			<div class="flex h-[52px] items-center gap-2.5">
				<button
					type="button"
					aria-label="이전 질문으로"
					onclick={() => go(-1)}
					class="grid size-11 shrink-0 place-items-center rounded-xl text-fg transition hover:bg-white/5 active:scale-95"
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				</button>
				<div class="flex flex-1 gap-1" role="progressbar" aria-valuemin="1" aria-valuemax={questions.length} aria-valuenow={qi} aria-label="질문 진행">
					{#each questions as s, i (s)}
						<div class="h-1 flex-1 rounded-full transition-colors duration-300 {i < qi ? 'bg-accent' : 'bg-white/[0.12]'}"></div>
					{/each}
				</div>
				<span class="min-w-[38px] text-right text-[13px] font-semibold text-fg/60 tabular-nums">{qi} / {questions.length}</span>
			</div>
			<p class="h-[22px] truncate pl-3.5 text-xs font-medium text-fg/55">{trail}</p>
		</header>
	{/if}

	<!-- 데스크톱 사이드 레일 — 로고(처음으로) · 진행 · 질문 목록 · 안내 -->
	<aside class="hidden min-h-0 flex-col gap-7 border-r border-white/[0.07] px-8 pt-7 pb-8 lg:flex">
		<button type="button" onclick={restart} class="flex items-center gap-2.5 text-left text-[15px] font-bold tracking-tight text-fg">
			<span class="grid size-7 place-items-center rounded-lg bg-accent text-[15px] font-extrabold text-bg">B</span>
			Sellery Branding
		</button>
		<div>
			<div class="flex items-baseline justify-between">
				<span class="text-xs font-bold tracking-[0.06em] text-fg/50">제조의뢰</span>
				<span class="text-[13px] font-bold text-accent tabular-nums">{stepLabel}</span>
			</div>
			<div class="mt-2.5 flex gap-1">
				{#each questions as s, i (s)}
					<div class="h-1 flex-1 rounded-full transition-colors duration-300 {step === 'done' || i < qi ? 'bg-accent' : 'bg-white/[0.12]'}"></div>
				{/each}
			</div>
		</div>
		<nav class="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="질문 목록">
			{#each rail as r (r.step)}
				<button
					type="button"
					disabled={r.locked}
					aria-current={r.on ? 'step' : undefined}
					onclick={() => (step = r.step)}
					class="flex items-center gap-3.5 rounded-[14px] px-3 py-[11px] text-left transition-colors {r.on ? 'bg-accent/10' : 'hover:bg-white/[0.03]'} {r.locked
						? 'cursor-default'
						: 'cursor-pointer'}"
				>
					<span
						class="grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] font-extrabold transition-colors {r.past
							? 'border-accent bg-accent text-bg'
							: r.on
								? 'border-accent text-accent'
								: 'border-white/[0.18] text-fg/40'}"
					>
						{r.n}
					</span>
					<span class="flex min-w-0 flex-1 flex-col gap-px">
						<span class="text-sm font-bold {r.locked ? 'text-fg/40' : 'text-fg'}">{r.title}</span>
						<span class="truncate text-xs text-fg/50">{r.value}</span>
					</span>
				</button>
			{/each}
		</nav>
		<div class="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
			<svg class="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
			<span class="text-xs leading-[1.55] text-fg/65">약 1분이면 끝나요. 확실하지 않은 건 건너뛰고 <br/> 첫 미팅에서 같이 정해요.</span>
		</div>
	</aside>

	<div class="flex min-h-0 flex-1 flex-col">
		<!-- 데스크톱 상단 바 — [이전] · 고른 경로 -->
		<div class="hidden h-[72px] shrink-0 items-center gap-2 px-14 lg:flex">
			{#if step !== 'done'}
				<button
					type="button"
					onclick={() => go(-1)}
					class="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 pr-3.5 pl-2.5 text-[13px] font-semibold text-fg/80 transition hover:border-white/30 hover:text-fg"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
					이전
				</button>
			{/if}
			<span class="ml-auto text-xs text-fg/40">{trail}</span>
		</div>
		{#key step}
			<section class="flex min-h-0 flex-1 flex-col motion-safe:animate-step">
				{#if step === 'category'}
					<!-- ============ Q: 카테고리 ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('category')} · 카테고리</p>
						<h1 class={h1Cls}>어떤 웰니스 브랜드를 <br class="lg:hidden" />만들고 싶으세요?</h1>
						<p class={helperCls}>가장 가까운 하나를 골라주세요. 탭하면 바로 넘어가요.</p>
						<div class="mt-6 {bodyCls} lg:mt-7">
							<TileGroup options={CATEGORIES} value={category} label="카테고리" desc={OPTION_DESC} onpick={pickCategory} />
							{#if errors.category}<p class={errCls}>{errors.category}</p>{/if}
						</div>
						<!-- 최소 제작 수량 안내 — 옛 인트로 카드의 문구 그대로, 시작 전에 알 수 있게 첫 질문에 둔다 -->
						<div class="mt-6 flex items-center gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-[18px] py-4 text-sm text-fg/85 {bodyCls} lg:mt-7">
							<svg class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
							<span><b class="font-bold text-fg">최소 제작 수량 {MIN_QTY.toLocaleString('ko-KR')}개</b> — 제형 및 패키지 형태에 따라 달라 질 수 있습니다.</span>
						</div>
					</div>
					{@render nextFoot()}
				{:else if step === 'ingredient'}
					<!-- ============ Q: 메인 성분 + 추가 내용 (둘 다 선택) ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('ingredient')} · 메인 성분 <span class="font-semibold text-fg/50">(선택)</span></p>
						<h1 class={h1Cls}>꼭 넣고 싶은 <br class="lg:hidden" />성분이 있나요?</h1>
						<p class={helperCls}>비워두면 매니저가 제안드려요. 미팅 때 같이 정해요.</p>
						<div class="{bodyCls} lg:mt-7 lg:grid lg:grid-cols-2 lg:gap-10">
						<div>
						<div class="mt-6 flex flex-col gap-2 lg:mt-0">
							<label for="ingredient" class={labelCls}>성분 이름</label>
							<input id="ingredient" bind:value={ingredient} type="text" autocomplete="off" placeholder="예: 가르시니아, 저분자 콜라겐, 밀크씨슬" class="{inputCls} h-14" />
						</div>
						{#if suggestions.length > 0}
							<p class="mt-6 mb-2.5 text-[13px] font-semibold text-fg/55">{category} 제품에 자주 쓰는 성분</p>
							<div class="flex flex-wrap gap-2">
								{#each suggestions as s (s)}
									{@const on = pickedIngredients.includes(s)}
									<button
										type="button"
										aria-pressed={on}
										onclick={() => toggleIngredient(s)}
										class="h-11 rounded-full border-[1.5px] px-4 text-[15px] font-semibold whitespace-nowrap transition active:scale-95 {on
											? 'border-accent bg-accent/[0.12] text-accent'
											: 'border-white/[0.14] text-fg/85 hover:border-white/30'}"
									>
										{on ? '✓' : '+'} {s}
									</button>
								{/each}
							</div>
						{/if}
						</div>
						<div class="mt-6 flex flex-col gap-2 lg:mt-0">
							<label for="note" class={labelCls}>더 전달하고 싶은 내용 <span class="font-medium text-fg/50">(선택)</span></label>
							<textarea id="note" bind:value={note} rows="3" placeholder="브랜드 컨셉, 참고하는 제품, 론칭 희망 시기 등 편하게 적어주세요" class="{inputCls} resize-none py-3.5 leading-normal lg:min-h-[214px]"></textarea>
						</div>
						</div>
					</div>
					<div class={footCls}>
						<button type="button" onclick={() => go(1)} class={pickedIngredients.length > 0 || note.trim() ? ctaOn : ctaOff}>
							{pickedIngredients.length > 0 || note.trim() ? '다음' : '건너뛰기'}
						</button>
					</div>
				{:else if step === 'form'}
					<!-- ============ Q: 제형 ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('form')} · 제형</p>
						<h1 class={h1Cls}>어떤 형태로 <br class="lg:hidden" />먹게 하고 싶으세요?</h1>
						<p class={helperCls}>제형에 따라 패키지 선택지가 달라져요</p>
						<div class="mt-[22px] {bodyCls} lg:mt-7">
							<TileGroup options={DOSAGE_FORMS} value={dosageForm} label="제형" layout="grid-lg" desc={OPTION_DESC} onpick={pickForm} />
							{#if errors.dosageForm}<p class={errCls}>{errors.dosageForm}</p>{/if}
						</div>
						{@render unsureButton(dosageForm === UNSURE, () => pickForm(UNSURE))}
					</div>
					{@render nextFoot()}
				{:else if step === 'sub'}
					<!-- ============ Q: 세부 종류 (알약 · 캔디) ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('sub')} · {subCopy.eyebrow}</p>
						<h1 class={h1Cls}>{subCopy.title[0]} <br class="lg:hidden" />{subCopy.title[1]}</h1>
						<p class={helperCls}>{subCopy.help}</p>
						<div class="mt-[22px] {bodyCls} lg:mt-7">
							<TileGroup options={subOptions} value={subType} label={subCopy.eyebrow} layout="row" desc={OPTION_DESC} onpick={pickSub} />
							{#if errors.subType}<p class={errCls}>{errors.subType}</p>{/if}
						</div>
						{@render unsureButton(subType === UNSURE, () => pickSub(UNSURE))}
					</div>
					{@render nextFoot()}
				{:else if step === 'package'}
					<!-- ============ Q: 패키지 ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('package')} · 패키지</p>
						<h1 class={h1Cls}>팔로워 손에 <br class="lg:hidden" />어떻게 들려 있을까요?</h1>
						<p class={helperCls}>{packageHelper}</p>
						<div class="mt-[22px] {bodyCls} lg:mt-7">
							<TileGroup options={packagingOptions} value={packaging} label="패키지" layout="row" desc={OPTION_DESC} onpick={pickPackage} />
							{#if errors.packaging}<p class={errCls}>{errors.packaging}</p>{/if}
						</div>
						{@render unsureButton(packaging === UNSURE, () => pickPackage(UNSURE))}
					</div>
					{@render nextFoot()}
				{:else if step === 'flavor'}
					<!-- ============ Q: 맛 ============ -->
					<div class={scrollCls}>
						<p class={eyebrowCls}>{q('flavor')} · 맛</p>
						<h1 class={h1Cls}>첫 맛은 <br class="lg:hidden" />무엇으로 할까요?</h1>
						<p class={helperCls}>탭하면 바로 다음으로 넘어가요</p>
						<div class="mt-[22px] {bodyCls} lg:mt-7">
							<TileGroup options={FLAVORS} value={flavor} label="맛" layout="swatch" swatch={FLAVOR_SWATCH} onpick={pickFlavor} />
						</div>
						{@render unsureButton(flavor === UNSURE, () => pickFlavor(UNSURE))}
					</div>
					{@render nextFoot()}
				{:else if step === 'contact'}
					<!-- ============ 연락처 + 제출 ============ -->
					<form
						method="POST"
						class="flex min-h-0 flex-1 flex-col"
						use:enhance={() => {
							submitting = true;
							submitError = '';
							return async ({ result }) => {
								submitting = false;
								if (result.type === 'success') {
									errors = {};
									step = 'done';
								} else if (result.type === 'failure') {
									errors = (result.data?.errors as ApplyErrors | undefined) ?? {};
									const target = stepOfErrors(errors);
									step = target && steps.includes(target) ? target : 'contact';
								} else if (result.type === 'error') {
									// 기본 에러 페이지로 넘어가면 입력값이 날아간다 — 폼을 그대로 두고 배너만
									submitError = '일시적인 오류가 났어요. 잠시 후 다시 시도해주세요';
								} else {
									await applyAction(result);
								}
							};
						}}
					>
						<!-- 앞 단계에서 모은 답 — 이 화면에서 한 번에 보낸다 -->
						<input type="hidden" name="category" value={category} />
						<input type="hidden" name="ingredient" value={ingredient} />
						<input type="hidden" name="dosageForm" value={dosageForm} />
						<input type="hidden" name="subType" value={subType} />
						<input type="hidden" name="packaging" value={packaging} />
						<input type="hidden" name="flavor" value={flavorNeeded ? flavor : ''} />
						<input type="hidden" name="note" value={note} />
						<input type="hidden" name="slot" value={slot} />

						<div class="{scrollCls} pb-6">
							<p class={eyebrowCls}>마지막 · 연락처</p>
							<h1 class={h1Cls}>마지막이에요. <br class="lg:hidden" />어디로 연락드릴까요?</h1>
							<p class={helperCls}>전담 매니저가 내용을 확인한 뒤 미팅 일정을 제안드려요.</p>
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
								<label class="flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/[0.03] px-4 py-3.5 lg:col-span-2">
									<input name="agree" type="checkbox" bind:checked={agree} class="m-0 size-[22px] shrink-0 accent-[color:var(--color-accent)]" />
									<span class="text-[13px] leading-[1.55] text-fg/70">
										<b class="font-bold text-fg">(필수)</b> 남겨주신 연락처는 제조의뢰 상담 목적으로만 사용되며, 상담 종료 후 파기돼요.
									</span>
								</label>
								{#if errors.agree}<p class="{errCls} lg:col-span-2">{errors.agree}</p>{/if}
							</div>
						</div>
						<div class={footCls}>
							{#if formError}
								<p role="alert" class="mb-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm font-semibold text-fg lg:max-w-[900px] lg:self-stretch">{formError}</p>
							{/if}
							<button
								type="submit"
								disabled={!canSubmit || submitting}
								class="{canSubmit ? ctaOn : ctaOff} disabled:pointer-events-none {canSubmit ? 'disabled:opacity-60' : 'text-fg/40'}"
							>
								{submitting ? '접수하는 중…' : '제조의뢰 접수하기'}
							</button>
						</div>
					</form>
				{:else}
					<!-- ============ 접수 완료 ============ -->
					<div class="{scrollCls} pt-16 pb-5 lg:pt-6">
						<div class="grid size-16 place-items-center rounded-full bg-accent motion-safe:animate-pop">{@render check(32)}</div>
						<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-0.03em] text-fg lg:text-4xl lg:leading-[1.25]">접수됐어요</h1>
						<p class="mt-2.5 text-[15px] leading-relaxed text-fg-soft">
							{name.trim() ? `${name.trim()}님, ` : ''}전담 매니저가 내용을 확인하고 <br class="lg:hidden" />영업일 기준 3일 안에 미팅 일정을 제안드려요.
						</p>

						<div class="{bodyCls} lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
						<div class="mt-6 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-[18px] pt-1.5 pb-2 lg:mt-0 lg:px-5">
							<p class="mt-3 mb-1 text-[13px] font-bold text-fg/55">내가 그린 브랜드</p>
							{#each summary as row (row.k)}
								<div class="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-[11px] text-[15px]">
									<span class="shrink-0 text-fg/60">{row.k}</span>
									<span class="text-right font-semibold {row.muted ? 'text-fg/45' : 'text-fg'}">{row.v}</span>
								</div>
							{/each}
						</div>

						<div class="lg:rounded-[18px] lg:border lg:border-white/[0.07] lg:bg-white/[0.03] lg:px-5 lg:pt-[18px] lg:pb-2">
						<p class="mt-7 mb-3.5 text-[13px] font-bold text-fg/55 lg:mt-0">앞으로 이렇게 진행돼요</p>
						<ol class="flex flex-col">
							{#each [
								{ t: '접수 완료', d: '방금 보내주신 내용이 전달됐어요' },
								{ t: '전담 매니저 검토', d: '제형·패키지·수량 기준으로 가능한 방향을 살펴봐요' },
								{ t: '미팅 일정 확정', d: '카카오톡 또는 문자로 2~3개 시간을 보내드려요' }
							] as s, i (s.t)}
								<li class="flex gap-3.5">
									<div class="flex shrink-0 flex-col items-center">
										<span class="grid size-6 place-items-center rounded-full text-xs font-extrabold {i === 0 ? 'bg-accent text-bg' : 'border-[1.5px] border-white/30 text-fg/80'}">{i + 1}</span>
										{#if i < 2}<span class="min-h-[22px] w-0.5 flex-1 bg-white/10"></span>{/if}
									</div>
									<div class={i < 2 ? 'pb-4' : ''}>
										<p class="mt-0.5 text-[15px] font-bold text-fg">{s.t}</p>
										<p class="mt-1 text-[13px] text-fg/60">{s.d}</p>
									</div>
								</li>
							{/each}
						</ol>
						</div>
						</div>
					</div>
					<div class={footCls}>
						<button type="button" onclick={restart} class="flex h-14 w-full items-center justify-center rounded-2xl border-[1.5px] border-white/[0.14] text-[16px] font-bold text-fg transition hover:bg-white/5 active:scale-[0.98] lg:h-[52px] lg:w-[200px]">홈으로</button>
					</div>
				{/if}
			</section>
		{/key}
	</div>
	</div>
	{/if}
</main>
