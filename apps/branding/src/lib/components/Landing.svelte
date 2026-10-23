<script lang="ts">
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
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
	 *  여기는 현재 슬라이드 번호 · 스크롤/휠/키보드/점 이동 · 상단 바 · 하단 바만 맡는다. */
	let { onstart, onpick }: { onstart: () => void; onpick: (category: string) => void } = $props();

	const SLIDES = 7;
	let slider = $state<HTMLDivElement>();
	let slide = $state(0);
	// 가로 스크롤 진행도(0 ~ 6, 슬라이드 사이 값 포함) — 점 인디케이터가 이 값으로 흐른다
	let progress = $state(0);

	function onscroll() {
		if (!slider) return;
		progress = slider.scrollLeft / slider.clientWidth;
		const i = Math.round(progress);
		if (i !== slide) slide = i;
	}
	// 점 인디케이터 — 현재 장에 가까울수록 길고 진하다(0 → 1). 넘기는 동안 두 점 사이를 흐르듯 옮겨 간다
	const dotWeight = (i: number) => Math.max(0, 1 - Math.abs(progress - i));
	function goSlide(i: number) {
		const n = Math.max(0, Math.min(SLIDES - 1, i));
		slider?.scrollTo({ left: n * slider.clientWidth, behavior: 'smooth' });
	}
	// 마지막 장에서는 ▶(와 → 키)가 "다음 장"이 아니라 퍼널 시작이다 — 버튼도 포인트색 CTA 로 바뀐다
	const last = $derived(slide === SLIDES - 1);
	function next() {
		if (last) onstart();
		else goSlide(slide + 1);
	}
	// 데스크톱: 좌우 화살표 키로도 넘긴다 (이 컴포넌트는 intro 단계에서만 마운트된다). 브라우저 단축키(Cmd/Alt+화살표)는 건드리지 않는다
	function onkeydown(e: KeyboardEvent) {
		if (e.altKey || e.metaKey || e.ctrlKey) return;
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') goSlide(slide - 1);
	}

	// 데스크톱: 마우스 휠 세로 스크롤도 슬라이드 이동으로 받는다(가로 스크롤·트랙패드 가로 제스처는 스크롤 스냅이 원래대로 처리).
	// 한 번의 휠 굴림/제스처에 한 장만 — 이벤트가 끊기지 않고 이어지는 동안(트랙패드 관성 포함)은 한 번 넘긴 뒤 무시하고, 200ms 쉬면 새 제스처로 본다
	let wheelAcc = 0;
	let wheelFired = false;
	let wheelIdle: ReturnType<typeof setTimeout> | undefined;
	function onwheel(e: WheelEvent) {
		const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // Firefox 는 줄 단위
		if (Math.abs(dy) <= Math.abs(e.deltaX)) return;
		clearTimeout(wheelIdle);
		wheelIdle = setTimeout(() => {
			wheelAcc = 0;
			wheelFired = false;
		}, 200);
		if (wheelFired) return;
		wheelAcc += dy;
		if (Math.abs(wheelAcc) < 40) return;
		wheelFired = true;
		goSlide(slide + (wheelAcc > 0 ? 1 : -1));
	}
	$effect(() => () => clearTimeout(wheelIdle));

	// 진입 연출은 마운트 뒤에 켠다 — 첫 로드 때 1장도 아래에서 올라오도록
	let ready = $state(false);
	onMount(() => (ready = true));
	const active = (i: number) => ready && slide === i;

	// ◀ ▶ — 평소엔 유리 버튼, 마지막 장의 ▶ 만 포인트색으로 채워 "여기서 시작"을 알린다
	const navBtn = 'group relative hidden size-11 place-items-center rounded-full border transition lg:grid';
	const navIdle = 'border-white/[0.14] bg-white/[0.04] text-fg hover:border-accent hover:text-accent';
	const navCta = 'border-accent bg-accent text-bg hover:border-accent-deep hover:bg-accent-deep';
	// 키보드 힌트 툴팁 — 마우스를 올리거나 키보드로 포커스하면 버튼 위에 ← → 가 떠오른다 (읽기 전용이라 보조기기에는 숨김)
	const hint =
		'pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 rounded-lg border border-white/10 bg-[#1b1d23] px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-fg/80 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100';
	const kbd = 'grid size-[18px] place-items-center rounded-[5px] border border-white/15 bg-white/10 font-sans text-xs leading-none text-fg';
</script>

<svelte:window {onkeydown} />

<div class="relative flex min-h-0 flex-1 flex-col">
	<!-- 상단 바 — 슬라이드 위에 떠 있고 터치는 통과시킨다 -->
	<div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[60px] items-center justify-between px-5 lg:h-[72px] lg:px-16">
		<div class="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-fg">
			<!-- 원형 로고(static/logo.png · MYR) — 배경이 페이지와 같은 어두운색이라 얇은 링으로 윤곽만 잡는다 -->
			<img src={asset('/logo.png')} alt="" width="32" height="32" class="size-8 shrink-0 rounded-full ring-1 ring-white/15" />
			Make Your Recipe
		</div>
		<span class="text-xs font-semibold text-fg/50 tabular-nums" aria-live="polite">{slide + 1} / {SLIDES}</span>
	</div>

	<div bind:this={slider} {onscroll} {onwheel} class="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain">
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
			<button type="button" aria-label="이전 슬라이드" onclick={() => goSlide(slide - 1)} class="{navBtn} {navIdle}">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				<span class={hint} aria-hidden="true"><kbd class={kbd}>←</kbd>이전</span>
			</button>
			<div class="flex items-center gap-1.5" role="tablist" aria-label="슬라이드">
				{#each { length: SLIDES } as _, i (i)}
					{@const w = dotWeight(i)}
					<!-- 6px 점이 현재 장에서 22px 알약으로 — 스크롤 진행도에 따라 길이와 색이 연속으로 바뀐다 -->
					<button
						type="button"
						role="tab"
						aria-selected={i === slide}
						aria-label="{i + 1}번째 슬라이드"
						onclick={() => goSlide(i)}
						class="relative h-1.5 overflow-hidden rounded-full bg-white/20"
						style="width:{(6 + 16 * w).toFixed(1)}px"
					>
						<span class="absolute inset-0 rounded-full bg-accent" style="opacity:{w.toFixed(3)}"></span>
					</button>
				{/each}
			</div>
			<button type="button" aria-label={last ? '제조의뢰 시작하기' : '다음 슬라이드'} onclick={next} class="{navBtn} {last ? navCta : navIdle}">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
				<span class={hint} aria-hidden="true"><kbd class={kbd}>→</kbd>{last ? '제조의뢰 시작' : '다음'}</span>
			</button>
		</div>
		<div class="flex flex-col gap-3.5 short:gap-2.5 lg:flex-row lg:items-center lg:gap-5">
			<p class="order-2 text-center text-xs text-fg/55 lg:order-1 lg:text-[13px]">약 1분 · 선택형 · 무료 상담</p>
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
