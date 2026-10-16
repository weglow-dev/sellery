<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowIcon from './landing/ArrowIcon.svelte';
	import HeroSlide from './landing/HeroSlide.svelte';
	import ZeroSlide from './landing/ZeroSlide.svelte';
	import BurdenSlide from './landing/BurdenSlide.svelte';
	import ProcessSlide from './landing/ProcessSlide.svelte';
	import StorySlide from './landing/StorySlide.svelte';
	import CategorySlide from './landing/CategorySlide.svelte';
	import FinalSlide from './landing/FinalSlide.svelte';

	/** 퍼널의 첫 화면 = 랜딩. 가로로 넘기는 7장 슬라이드(스크롤 스냅) + 점 인디케이터 + [제조의뢰 시작하기].
	 *  모바일은 한 열(아래 정렬), lg 데스크톱은 1120px 두 열(왼쪽 글 · 오른쪽 카드)에 하단 바가 화살표 · 점 · CTA 한 줄로 바뀐다.
	 *  각 슬라이드는 landing/ 의 컴포넌트 하나씩이고, 자기 연출은 `active`(지금 보이는 장인지)만 받아 스스로 켠다.
	 *  여기는 현재 슬라이드 번호 · 스크롤/키보드/점 이동 · 상단 바 · 하단 바만 맡는다. */
	let { onstart, onpick }: { onstart: () => void; onpick: (category: string) => void } = $props();

	const SLIDES = 7;
	let slider = $state<HTMLDivElement>();
	let slide = $state(0);

	function onscroll() {
		if (!slider) return;
		const i = Math.round(slider.scrollLeft / slider.clientWidth);
		if (i !== slide) slide = i;
	}
	function goSlide(i: number) {
		const n = Math.max(0, Math.min(SLIDES - 1, i));
		slider?.scrollTo({ left: n * slider.clientWidth, behavior: 'smooth' });
	}
	// 데스크톱: 좌우 화살표 키로도 넘긴다 (이 컴포넌트는 intro 단계에서만 마운트된다)
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') goSlide(slide + 1);
		else if (e.key === 'ArrowLeft') goSlide(slide - 1);
	}

	// 진입 연출은 마운트 뒤에 켠다 — 첫 로드 때 1장도 아래에서 올라오도록
	let ready = $state(false);
	onMount(() => (ready = true));
	const active = (i: number) => ready && slide === i;

	const navBtn =
		'hidden size-11 place-items-center rounded-full border border-white/[0.14] bg-white/[0.04] text-fg transition hover:border-accent hover:text-accent lg:grid';
</script>

<svelte:window {onkeydown} />

<div class="relative flex min-h-0 flex-1 flex-col">
	<!-- 상단 바 — 슬라이드 위에 떠 있고 터치는 통과시킨다 -->
	<div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[60px] items-center justify-between px-5 lg:h-[72px] lg:px-16">
		<div class="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-fg">
			<span class="grid size-7 place-items-center rounded-lg bg-accent text-[15px] font-extrabold text-bg">B</span>
			Sellery Branding
		</div>
		<span class="text-xs font-semibold text-fg/50 tabular-nums" aria-live="polite">{slide + 1} / {SLIDES}</span>
	</div>

	<div bind:this={slider} {onscroll} class="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain">
		<HeroSlide active={active(0)} onnext={() => goSlide(1)} />
		<ZeroSlide active={active(1)} />
		<BurdenSlide active={active(2)} />
		<ProcessSlide active={active(3)} />
		<StorySlide active={active(4)} />
		<CategorySlide active={active(5)} {onpick} />
		<FinalSlide active={active(6)} />
	</div>

	<!-- 하단 — 모바일: 점 · 시작 버튼 · 안내 세 줄 / 데스크톱: [◀ 점 ▶] … 안내 · 시작 버튼 한 줄 -->
	<div class="flex shrink-0 flex-col gap-3.5 px-5 pt-2.5 pb-7 short:gap-2.5 short:pt-2 short:pb-5 lg:mx-auto lg:w-full lg:max-w-[1248px] lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-16 lg:pt-4 lg:pb-9">
		<div class="flex items-center justify-center gap-1.5 lg:gap-[18px]">
			<button type="button" aria-label="이전 슬라이드" onclick={() => goSlide(slide - 1)} class={navBtn}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			</button>
			<div class="flex items-center gap-1.5" role="tablist" aria-label="슬라이드">
				{#each { length: SLIDES } as _, i (i)}
					<button
						type="button"
						role="tab"
						aria-selected={i === slide}
						aria-label="{i + 1}번째 슬라이드"
						onclick={() => goSlide(i)}
						class="h-1.5 rounded-full transition-[width,background-color] duration-300 {i === slide ? 'w-[22px] bg-accent' : 'w-1.5 bg-white/20'}"
					></button>
				{/each}
			</div>
			<button type="button" aria-label="다음 슬라이드" onclick={() => goSlide(slide + 1)} class={navBtn}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</button>
		</div>
		<div class="flex flex-col gap-3.5 short:gap-2.5 lg:flex-row lg:items-center lg:gap-5">
			<p class="order-2 text-center text-xs text-fg/45 lg:order-1 lg:text-[13px] lg:text-fg/50">약 1분 · 선택형 · 무료 상담</p>
			<button
				type="button"
				onclick={onstart}
				class="order-1 flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-extrabold text-bg transition hover:bg-accent-deep active:scale-[0.98] short:h-[52px] short:text-base lg:order-2 lg:w-[280px]"
			>
				<span>제조의뢰 시작하기</span>
				<ArrowIcon size={20} />
			</button>
		</div>
	</div>
</div>
