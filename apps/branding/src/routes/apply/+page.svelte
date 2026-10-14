<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ChipGroup from '$lib/components/ChipGroup.svelte';
	import SiteHeader from '$lib/components/section/SiteHeader.svelte';
	import SiteFooter from '$lib/components/section/SiteFooter.svelte';
	import { CATEGORIES, DOSAGE_FORMS, FLAVORS, MIN_QTY, PACKAGING_BY_FORM, PILL_TYPES, type DosageForm } from './apply-options';
	import { formatPhone } from '$lib/utils/phone';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// 실패한 제출 뒤 서버가 돌려준 값으로 입력칸을 딱 한 번 복원한다(JS 없이 제출됐을 때의 폴백 경로) —
	// 이후 form 이 또 바뀌어도 사용자가 입력 중인 값을 덮어쓰지 않도록 의도적으로 반응하지 않는다.
	let name = $state(untrack(() => form?.values?.name ?? ''));
	let phone = $state(untrack(() => form?.values?.phone ?? ''));
	let category = $state(untrack(() => form?.values?.category ?? ''));
	let ingredient = $state(untrack(() => form?.values?.ingredient ?? ''));
	let dosageForm = $state<string>(untrack(() => form?.values?.dosageForm ?? ''));
	let pillType = $state(untrack(() => form?.values?.pillType ?? ''));
	let packaging = $state(untrack(() => form?.values?.packaging ?? ''));
	let flavor = $state(untrack(() => form?.values?.flavor ?? ''));
	let flavorCustom = $state(untrack(() => form?.values?.flavorCustom ?? ''));
	let note = $state(untrack(() => form?.values?.note ?? ''));

	let submitting = $state(false);
	// 서버에 닿지 못했거나(네트워크) 서버가 예외를 낸 경우(500) — 폼은 그대로 두고 배너만 띄운다
	let submitError = $state('');
	// 성공 여부는 form 이 바뀔 때마다 따라가야 한다 — use:enhance 로 새로고침 없이 제출해도 서버 응답이 form 으로 들어온다
	const success = $derived(form?.success === true);

	// 접수 완료 → 배너가 보이게 맨 위로 올리고, 몇 초 뒤 홈으로 보낸다(버튼으로 바로 갈 수도 있음)
	const REDIRECT_SEC = 6;
	let secondsLeft = $state(REDIRECT_SEC);
	$effect(() => {
		if (!success) return;
		window.scrollTo({ top: 0, behavior: 'auto' });
		secondsLeft = REDIRECT_SEC;
		const timer = setInterval(() => {
			secondsLeft -= 1;
			if (secondsLeft <= 0) {
				clearInterval(timer);
				goto('/');
			}
		}, 1000);
		return () => clearInterval(timer);
	});

	const errors = $derived(form?.errors ?? {});
	const packagingOptions = $derived(
		DOSAGE_FORMS.includes(dosageForm as DosageForm) ? PACKAGING_BY_FORM[dosageForm as DosageForm] : []
	);

	// 제형이 바뀌면 이전 제형 전용 선택(알약 종류 · 패키지)은 더 이상 유효하지 않으니 비운다
	let prevDosageForm = untrack(() => dosageForm);
	$effect(() => {
		if (dosageForm !== prevDosageForm) {
			if (dosageForm !== '알약') pillType = '';
			packaging = '';
			prevDosageForm = dosageForm;
		}
	});

	// 폼 전체 오류(전송 실패 등) — 서버가 돌려준 것과 클라이언트에서 잡은 것 중 하나
	const formError = $derived(errors.form ?? submitError);

	// 제출 실패 시 화면 위에서부터 가장 먼저 걸린 항목으로 스크롤 + 포커스한다. 폼 전체 오류면 상단 배너로.
	const FIELD_ORDER = ['name', 'phone', 'category', 'dosageForm', 'pillType', 'packaging', 'agree'] as const;
	$effect(() => {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (formError) {
			document.getElementById('form-error')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
			return;
		}
		const key = FIELD_ORDER.find((k) => errors[k]);
		if (!key) return;
		const el = document.getElementById(`field-${key}`);
		if (!el) return;
		el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
		el.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
	});
</script>

<svelte:head>
	<title>제조의뢰 — 셀러리 브랜딩</title>
	<meta name="description" content="웰니스 브랜드 제조의뢰 폼 — 카테고리, 제형, 패키지, 맛을 정하고 연락처를 남기면 전담 매니저가 연락드려요." />
	<meta name="robots" content="noindex" />
</svelte:head>

<SiteHeader />

<main class="min-h-screen bg-bg pt-28 pb-24 md:pt-36 md:pb-32">
	<div class="mx-auto max-w-2xl px-5">
		{#if success}
			<div class="rounded-3xl border border-line bg-panel px-6 py-14 text-center">
				<p class="text-5xl">🙌</p>
				<h1 class="mt-5 text-2xl font-semibold text-fg md:text-3xl">제조의뢰가 접수됐어요</h1>
				<p class="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-fg-soft">
					전담 매니저가 사흘 안에 남겨주신 연락처로 연락드려요. 상담은 무료이고, 아무 의무도 생기지 않아요.
				</p>
				<p class="mt-4 text-sm text-fg-faint" aria-live="polite">{secondsLeft}초 뒤 홈으로 이동해요</p>
				<a
					href="/"
					class="mt-8 inline-block rounded-2xl bg-accent px-7 py-3.5 text-[15px] font-bold text-bg transition hover:-translate-y-0.5 hover:bg-accent-deep active:scale-95"
				>
					홈으로 돌아가기
				</a>
			</div>
		{:else}
			<a href="/" class="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-faint transition hover:text-fg-soft">
				← 홈으로
			</a>

			<h1 class="mt-5 text-[28px] leading-[1.3] font-bold tracking-[-0.02em] text-fg md:text-[36px]">
				제조의뢰 시작하기
			</h1>
			<p class="mt-3 max-w-lg text-[15px] leading-relaxed text-fg-soft">
				아래 내용을 정해주시면 전담 매니저가 확인하고 연락드려요. 확실하지 않은 항목은 비워두셔도 괜찮아요 — 첫 미팅에서 같이 정해요.
			</p>

			<div class="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/50 px-4 py-3.5 text-sm text-fg-soft">
				<span class="font-bold text-accent">최소 제작 수량</span> {MIN_QTY.toLocaleString('ko-KR')}개 — 모든 카테고리·제형 공통 고정값이에요.
			</div>

			{#if formError}
				<div
					id="form-error"
					role="alert"
					class="mt-6 scroll-mt-24 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3.5 text-sm font-semibold text-fg"
				>
					{formError}
				</div>
			{/if}

			<form
				method="POST"
				class="mt-10 space-y-10"
				use:enhance={() => {
					submitting = true;
					submitError = '';
					return async ({ result, update }) => {
						if (result.type === 'error') {
							// 기본 에러 페이지로 넘어가면 입력값이 날아간다 — update() 를 부르지 않고 폼을 그대로 둔다
							submitError = '일시적인 오류가 났어요. 잠시 후 다시 시도해주세요';
						} else {
							await update({ reset: false });
						}
						submitting = false;
					};
				}}
			>
				<!-- 연락처 -->
				<section class="space-y-4">
					<h2 class="text-lg font-bold text-fg">연락처</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						<label id="field-name" class="block scroll-mt-24">
							<span class="mb-1.5 block text-sm font-semibold text-fg-soft">활동명 / 브랜드명</span>
							<input
								name="name"
								bind:value={name}
								type="text"
								placeholder="예: 지유, 바인허브"
								class="w-full rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
							/>
							{#if errors.name}<p class="mt-1.5 text-xs text-accent">{errors.name}</p>{/if}
						</label>
						<label id="field-phone" class="block scroll-mt-24">
							<span class="mb-1.5 block text-sm font-semibold text-fg-soft">연락처</span>
							<input
								name="phone"
								value={phone}
								oninput={(e) => (phone = formatPhone(e.currentTarget.value))}
								type="tel"
								inputmode="numeric"
								maxlength="13"
								autocomplete="tel"
								placeholder="010-0000-0000"
								class="w-full rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
							/>
							{#if errors.phone}<p class="mt-1.5 text-xs text-accent">{errors.phone}</p>{/if}
						</label>
					</div>
				</section>

				<!-- 1. 웰니스 제품(성분) -->
				<section class="space-y-4">
					<h2 class="text-lg font-bold text-fg">1. 웰니스 제품(성분)</h2>
					<div id="field-category" class="scroll-mt-24">
						<p class="mb-2.5 text-sm font-semibold text-fg-soft">카테고리</p>
						<ChipGroup name="category" options={CATEGORIES} bind:value={category} label="카테고리" />
						{#if errors.category}<p class="mt-1.5 text-xs text-accent">{errors.category}</p>{/if}
					</div>
					<label class="block">
						<span class="mb-1.5 block text-sm font-semibold text-fg-soft">들어갔으면 하는 메인 성분 (선택)</span>
						<textarea
							name="ingredient"
							bind:value={ingredient}
							rows="2"
							placeholder="없으면 비워두셔도 돼요 — 미팅 때 함께 정해요."
							class="w-full resize-none rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
						></textarea>
					</label>
				</section>

				<!-- 2. 제형 -->
				<section class="space-y-4">
					<h2 class="text-lg font-bold text-fg">2. 제형</h2>
					<div id="field-dosageForm" class="scroll-mt-24">
						<ChipGroup name="dosageForm" options={DOSAGE_FORMS} bind:value={dosageForm} label="제형" />
						{#if errors.dosageForm}<p class="mt-1.5 text-xs text-accent">{errors.dosageForm}</p>{/if}
					</div>

					{#if dosageForm === '알약'}
						<div id="field-pillType" class="scroll-mt-24">
							<p class="mb-2.5 text-sm font-semibold text-fg-soft">알약 종류</p>
							<ChipGroup name="pillType" options={PILL_TYPES} bind:value={pillType} label="알약 종류" />
							{#if errors.pillType}<p class="mt-1.5 text-xs text-accent">{errors.pillType}</p>{/if}
						</div>
					{/if}
				</section>

				<!-- 3. 패키지 -->
				{#if packagingOptions.length > 0}
					<section class="space-y-4">
						<h2 class="text-lg font-bold text-fg">3. 패키지</h2>
						<div id="field-packaging" class="scroll-mt-24">
							<ChipGroup name="packaging" options={packagingOptions} bind:value={packaging} label="패키지" />
							{#if errors.packaging}<p class="mt-1.5 text-xs text-accent">{errors.packaging}</p>{/if}
						</div>
					</section>
				{/if}

				<!-- 4. 맛 -->
				<section class="space-y-4">
					<h2 class="text-lg font-bold text-fg">4. 어떤 맛?</h2>
					<ChipGroup name="flavor" options={FLAVORS} bind:value={flavor} label="맛" />
					{#if flavor === '기타'}
						<input
							name="flavorCustom"
							bind:value={flavorCustom}
							type="text"
							placeholder="원하는 맛을 적어주세요"
							class="w-full rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
						/>
					{/if}
				</section>

				<!-- 5. 마지막 주관식 -->
				<section class="space-y-4">
					<h2 class="text-lg font-bold text-fg">5. 더 전달하고 싶은 내용이 있다면</h2>
					<textarea
						name="note"
						bind:value={note}
						rows="4"
						placeholder="자유롭게 적어주세요 (선택)"
						class="w-full resize-none rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
					></textarea>
				</section>

				<section id="field-agree" class="scroll-mt-24 space-y-3 border-t border-line pt-6">
					<label class="flex items-start gap-2.5 text-sm text-fg-soft">
						<input name="agree" type="checkbox" class="mt-0.5 size-4 accent-[color:var(--color-accent)]" />
						<span>
							(필수) 남겨주신 연락처는 제조의뢰 상담 목적으로만 사용되며, 상담 종료 후 파기돼요.
						</span>
					</label>
					{#if errors.agree}<p class="text-xs text-accent">{errors.agree}</p>{/if}
				</section>

				<button
					type="submit"
					disabled={submitting}
					class="w-full rounded-2xl bg-accent px-7 py-4 text-[17px] font-bold text-bg shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-deep hover:shadow-xl hover:shadow-accent/30 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
				>
					{submitting ? '접수하는 중…' : '제조의뢰 접수하기'}
				</button>
			</form>
		{/if}
	</div>
</main>

<SiteFooter />
