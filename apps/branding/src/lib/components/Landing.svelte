<script lang="ts">
	import TileIcon from './TileIcon.svelte';
	import { LANDING_CATEGORIES } from '$lib/utils/apply-options';

	/** 퍼널의 첫 화면 = 랜딩. 가로로 넘기는 7장 슬라이드(스크롤 스냅) + 점 인디케이터 + [제조의뢰 시작하기].
	 *  모바일은 한 열(아래 정렬), lg 데스크톱은 1120px 두 열(왼쪽 글 · 오른쪽 카드)에 하단 바가 화살표 · 점 · CTA 한 줄로 바뀐다.
	 *  각 슬라이드의 연출(취소선 · 칩 이동 · 진행 과정 자동 재생 · 타일 등장)은 현재 슬라이드 번호(slide)로만 켜진다. */
	let { onstart, onpick }: { onstart: () => void; onpick: (category: string) => void } = $props();

	const SLIDES = 7;
	let slider = $state<HTMLDivElement>();
	let slide = $state(0);
	let burdenSel = $state(0);
	let procSel = $state(0);
	let procTouched = $state(false);
	let landingPick = $state<number | null>(null);

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

	// 진행 과정 슬라이드: 사용자가 손대기 전까지 3.2초마다 다음 단계로 넘어간다
	$effect(() => {
		const t = setInterval(() => {
			if (slide === 3 && !procTouched) procSel = (procSel + 1) % 4;
		}, 3200);
		return () => clearInterval(t);
	});

	// 카테고리 타일: 선택 표시를 잠깐 보여준 뒤 그 카테고리로 퍼널을 시작한다
	let pickTimer: ReturnType<typeof setTimeout> | undefined;
	function pickCategory(i: number) {
		landingPick = i;
		clearTimeout(pickTimer);
		pickTimer = setTimeout(() => onpick(LANDING_CATEGORIES[i].category), 260);
	}
	$effect(() => () => clearTimeout(pickTimer));

	// 데스크톱 히어로 오른쪽의 떠 있는 제형 카드 — 살짝씩 기울여 흩어 놓고, 젤리 하나만 포인트 색
	const HERO_TILES = [
		{ name: '알약', tilt: 'rotate(-7deg) translateY(4px)', hot: false },
		{ name: '젤리', tilt: 'rotate(4deg) translateY(-10px)', hot: true },
		{ name: '분말', tilt: 'rotate(-3deg) translateY(8px)', hot: false },
		{ name: '액상', tilt: 'rotate(5deg) translateY(-2px)', hot: false },
		{ name: '필름', tilt: 'rotate(-5deg) translateY(10px)', hot: false },
		{ name: '캔디', tilt: 'rotate(8deg) translateY(2px)', hot: false }
	];
	// 셋씩 다른 박자로 둥실거리게 — 기울기(안쪽 카드)와 겹치지 않도록 바깥 래퍼에 건다
	const FLOAT = ['motion-safe:animate-float', 'motion-safe:animate-float-delay', 'motion-safe:animate-float-delay-2'];
	const ZERO_ROWS = [
		{ label: '초기 비용', was: '₩ 3,000만', now: '0원' },
		{ label: '떠안는 재고', was: '300박스', now: '0박스' },
		{ label: '준비할 서류', was: '12장', now: '1장' }
	];
	const BURDENS = [
		{ t: '재고 부담', n: '0', d: '생산량 결정도, 창고도, 남는 재고도 셀러리가 책임져요.' },
		{ t: '제조비용', n: '0', d: '제조 비용은 셀러리가 먼저 부담, 판매분만 정산해요.' },
		{ t: '행정 리스크', n: '0', d: '인허가, 표시·광고 검토 등 전부 대행해요.' },
		{ t: '전담 매니저', n: '1:1', d: '컨셉부터 론칭까지 담당자가 끝까지 함께해요.' },
		{ t: '샘플 제작', n: '빠름', d: '검증된 제조 파트너와 빠르게 샘플을 확인해요.' }
	];
	const PROCESS = [
		{ n: '01', t: '제조의뢰', stage: '지금 여기', d: '만들고 싶은 제품을 알려주세요. 폼 하나 작성이면 충분해요.' },
		{ n: '02', t: '컨셉 · 샘플', stage: '전담 매니저와', d: '전담 매니저와 브랜드 컨셉을 잡고, 샘플을 직접 받아 확인해요.' },
		{ n: '03', t: '생산 · 입고', stage: '검증된 파트너가', d: '검증된 제조 파트너가 생산하고, 셀러리 물류센터로 바로 입고돼요.' },
		{ n: '04', t: '내 샵 오픈', stage: '판매 시작', d: '내 이름을 건 샵이 열려요. 링크 하나 공유하면 판매 시작이에요.' }
	];
	const STORY = [
		{ n: '01', t: '컨셉 스토리', d: '당신의 메시지를 브랜드 언어로 바꿔요.' },
		{ n: '02', t: '비주얼 아이덴티티', d: '로고, 패키지, 비주얼 톤까지 함께 잡아요.' },
		{ n: '03', t: '팔로워와의 연결', d: '샵 오픈부터 첫 판매까지 같이 만들어요.' }
	];
	const SERVICES = ['주문·결제 자동화', '포장·출고 대행', '투명한 정산 리포트'];
	const FINAL_STATS = [
		{ big: '4', unit: '단계', label: '제조의뢰 → 샵 오픈' },
		{ big: '0', unit: '원', label: '초기 비용' },
		{ big: '0', unit: '건', label: '떠안는 재고' },
		{ big: '1:1', unit: '', label: '전담 매니저' }
	];

	// lg(1024px) 이상인지 — 3장 칩이 건너가는 거리가 열 간격(모바일 8px · 데스크톱 12px)에 맞게 바뀐다
	let desktop = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 1024px)');
		const sync = () => (desktop = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const z = $derived(slide === 1);
	const bz = $derived(slide === 2);
	const pz = $derived(slide === 3);
	const cz = $derived(slide === 5);
	const fz = $derived(slide === 6);

	// 슬라이드 공통: 모바일은 내용 아래 정렬(mt-auto) + 화면이 낮으면 내부 세로 스크롤, lg 는 가운데 정렬 두 열
	const slideCls =
		'no-scrollbar relative flex h-full w-full shrink-0 snap-start flex-col overflow-x-hidden overflow-y-auto px-6 pt-[72px] pb-6 short:pt-16 short:pb-4 lg:justify-center lg:px-16 lg:pt-24 lg:pb-12';
	const twoCol =
		'relative mt-auto lg:mx-auto lg:mt-0 lg:grid lg:w-full lg:max-w-[1120px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-20';
	// 3장(할 일 표)은 다른 슬라이드처럼 아래 정렬하되 모바일에서 아래 여백을 조금 줘 살짝 올라와 보이게 한다
	const twoColLift = `${twoCol} mb-2 lg:mb-0`;
	const rightCol = 'mt-[22px] min-w-0 lg:mt-0';
	const eyebrowCls = 'text-[13px] font-bold text-accent lg:text-sm';
	const h2Cls = 'mt-3 text-[30px] leading-[1.25] font-extrabold tracking-[-0.03em] text-balance text-fg short:mt-2 short:text-[26px] lg:text-[46px] lg:leading-[1.18]';
	const navBtn =
		'hidden size-11 place-items-center rounded-full border border-white/[0.14] bg-white/[0.04] text-fg transition hover:border-accent hover:text-accent lg:grid';
</script>

<svelte:window {onkeydown} />

{#snippet arrow(size: number, cls = '')}
	<svg class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
{/snippet}

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
		<!-- 1 · 히어로 -->
		<section class={slideCls} aria-label="소개">
			<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
				<div
					class="absolute top-5 -right-20 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.35),transparent)] lg:-top-[200px] lg:-right-[170px] lg:size-[780px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,0.5),rgba(255,122,61,0.16)_55%,transparent)] lg:opacity-85"
				></div>
				<div class="absolute top-16 left-6 text-[150px] leading-none font-extrabold tracking-[-0.06em] text-white/5 select-none lg:top-auto lg:-right-5 lg:bottom-10 lg:left-auto lg:text-[260px]">YOU</div>
			</div>
			<div class={twoCol}>
				<div class="relative">
					<p class="{eyebrowCls} tracking-[0.02em]">인플루언서 전용 브랜드 메이킹</p>
					<h1 class="mt-3 text-[38px] leading-[1.2] font-extrabold tracking-[-0.035em] text-balance text-fg lg:text-6xl lg:leading-[1.12]">팔로워가 있다면,<br />브랜드도<br />가질 수 있어요</h1>
					<p class="mt-[18px] text-[15px] leading-[1.65] text-pretty text-accent lg:max-w-[520px] lg:text-lg">
						다이어트, 이너뷰티, 더마 — 내 이름을 건 웰니스 브랜드. 만드는 일도, 쌓이는 재고도, 복잡한 행정도 전부 셀러리가 맡을게요.
					</p>
					<button type="button" onclick={() => goSlide(1)} class="mt-[22px] flex items-center gap-2 text-[13px] font-semibold text-fg/50 transition hover:text-fg/80">
						<span class="lg:hidden">옆으로 넘겨 어떻게 진행되는지 보기</span>
						<span class="hidden lg:inline">화살표나 트랙패드로 넘겨보세요</span>
						{@render arrow(16)}
					</button>
				</div>
				<!-- 데스크톱에만: 떠 있는 제형 카드 6장 -->
				<div class="hidden min-w-0 lg:block">
					<div class="ml-auto grid max-w-[460px] grid-cols-3 gap-3.5">
						{#each HERO_TILES as t, i (t.name)}
							<div class={FLOAT[i % 3]}>
								<div
									class="flex h-[120px] flex-col items-center justify-center gap-2 rounded-[26px] border text-fg/90 {t.hot
										? 'border-[1.5px] border-accent bg-accent/[0.14]'
										: 'border-white/[0.09] bg-panel'}"
									style="transform: {t.tilt}"
								>
									<TileIcon name={t.name} size={40} />
									<span class="text-[13px] font-semibold text-fg/75">{t.name}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- 2 · 0 에서 시작 -->
		<section class={slideCls} aria-label="초기 비용">
			<div class={twoCol}>
				<div class="relative">
					<p class="{eyebrowCls} tracking-[0.08em]">START WITH ZERO</p>
					<h2 class={h2Cls}>시작하는 데 필요한 건<br />당신의 이름뿐이에요</h2>
				</div>
				<div class={rightCol}>
					<div class="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-[18px] py-1 lg:ml-auto lg:max-w-[480px] lg:rounded-[26px] lg:px-[26px] lg:py-2">
						{#each ZERO_ROWS as r, i (r.label)}
							<div class="flex items-center gap-3 py-3.5 lg:gap-3.5 lg:py-[26px] {i ? 'border-t border-white/[0.07]' : ''}">
								<span class="flex-1 text-sm font-semibold text-fg/70 lg:text-base">{r.label}</span>
								<span class="relative text-[15px] font-bold whitespace-nowrap text-fg/40 tabular-nums lg:text-[17px]">
									{r.was}
									<span class="absolute top-1/2 left-0 h-0.5 bg-accent" style="width:{z ? '100%' : '0%'};transition:width .5s cubic-bezier(.2,.8,.2,1) {0.25 + i * 0.35}s"></span>
								</span>
								{@render arrow(14, 'text-white/35')}
								<span
									class="min-w-[38px] text-right text-[22px] font-extrabold tracking-[-0.04em] text-accent tabular-nums lg:min-w-[60px] lg:text-[32px]"
									style="opacity:{z ? 1 : 0};transform:{z ? 'none' : 'scale(.6)'};transition:opacity .4s {0.55 + i * 0.35}s,transform .4s cubic-bezier(.3,1.4,.5,1) {0.55 + i * 0.35}s"
								>
									{r.now}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- 3 · 부담은 셀러리가 -->
		<section class={slideCls} aria-label="셀러리가 맡는 일">
			<div class={twoColLift}>
				<div class="relative">
					<p class={eyebrowCls}>부담은 셀러리가</p>
					<h2 class={h2Cls}>브랜드를 운영하는 데<br />필요한 모든 걸 준비했어요</h2>
				</div>
				<div class="{rightCol} mt-4 short:mt-3.5 lg:ml-auto lg:w-full lg:max-w-[560px]">
					<div class="grid grid-cols-2 gap-2 text-[13px] font-bold tracking-[0.04em] short:text-xs lg:gap-3 lg:text-[13px]">
						<div class="px-1 text-fg/45">내가 할 일</div>
						<div class="flex items-center gap-1.5 px-1 text-accent"><span class="size-1.5 rounded-full bg-accent"></span>셀러리가 할 일</div>
					</div>
					<div class="mt-2 flex flex-col gap-2 short:mt-1.5 short:gap-1 lg:mt-2.5 lg:gap-2">
						{#each BURDENS as b, i (b.t)}
							{@const on = burdenSel === i}
							<div class="relative grid grid-cols-2 gap-2 lg:gap-3">
								<div class="h-14 rounded-[14px] border border-dashed border-white/10 short:h-[38px] short:rounded-xl"></div>
								<div class="h-14 rounded-[14px] border border-dashed border-white/10 short:h-[38px] short:rounded-xl"></div>
								<!-- 슬라이드가 보이면 "내가 할 일" 칸의 짐이 "셀러리가 할 일" 칸으로 하나씩 건너간다 -->
								<button
									type="button"
									aria-pressed={on}
									onclick={() => (burdenSel = i)}
									class="absolute top-0 left-0 flex h-14 w-[calc(50%-4px)] items-center justify-between rounded-[14px] border px-4 text-[15px] font-bold short:h-[38px] short:rounded-xl short:px-3 short:text-xs lg:w-[calc(50%-6px)] {on
										? 'border-accent bg-accent/[0.14] text-accent'
										: 'border-white/[0.12] bg-panel text-fg/85'}"
									style="transform:{bz ? `translateX(calc(100% + ${desktop ? 12 : 8}px))` : 'none'};transition:transform .55s cubic-bezier(.2,.8,.2,1) {0.3 + i * 0.3}s,background-color .3s,border-color .3s,color .3s"
								>
									<span>{b.t}</span><span class="text-[13px] font-extrabold opacity-80 short:text-xs">{b.n}</span>
								</button>
							</div>
						{/each}
					</div>
					<div class="mt-2.5 grid grid-cols-2 items-stretch gap-2 short:mt-2 lg:mt-3 lg:gap-3">
						<div
							class="rounded-2xl bg-accent p-[18px] text-[15px] leading-[1.35] font-extrabold text-bg short:rounded-[14px] short:p-2.5 short:text-xs"
							style="opacity:{bz ? 1 : 0};transform:{bz ? 'none' : 'translateY(8px)'};transition:opacity .5s 1.9s,transform .5s cubic-bezier(.2,.8,.2,1) 1.9s"
						>
							브랜드에만<br />집중하기
						</div>
						<div class="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-[18px] text-[13px] leading-relaxed text-fg/75 short:rounded-[14px] short:p-2.5 short:text-[11px] short:leading-normal">{BURDENS[burdenSel].d}</div>
					</div>
				</div>
			</div>
		</section>

		<!-- 4 · 진행 과정 -->
		<section class={slideCls} aria-label="진행 과정">
			<div class={twoCol}>
				<div class="relative">
					<p class={eyebrowCls}>진행 과정</p>
					<h2 class={h2Cls}>브랜드가 되기까지,<br />네 단계면 돼요</h2>
				</div>
				<div class="{rightCol} lg:ml-auto lg:w-full lg:max-w-[480px]">
					<div class="relative flex min-h-[168px] flex-col justify-end overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] px-5 pt-[22px] pb-5">
						<div aria-hidden="true" class="absolute top-1 right-3.5 text-8xl leading-none font-extrabold tracking-[-0.06em] text-accent/[0.12] tabular-nums">{PROCESS[procSel].n}</div>
						{#key procSel}
							<div class="relative motion-safe:animate-step">
								<div class="text-xs font-bold tracking-[0.04em] text-accent">{PROCESS[procSel].stage}</div>
								<div class="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] text-fg">{PROCESS[procSel].t}</div>
								<div class="mt-2 text-sm leading-[1.55] text-pretty text-fg/70">{PROCESS[procSel].d}</div>
							</div>
						{/key}
					</div>
					<div class="mt-3.5 grid grid-cols-4 gap-1.5">
						{#each PROCESS as p, i (p.n)}
							{@const cur = i === procSel}
							<button
								type="button"
								aria-pressed={cur}
								onclick={() => {
									procSel = i;
									procTouched = true;
								}}
								class="flex flex-col gap-2 text-left transition-colors duration-300 {cur ? 'text-fg' : 'text-fg/40'}"
							>
								<span class="relative block h-1 overflow-hidden rounded-sm bg-white/10">
									<span
										class="absolute inset-y-0 left-0 bg-accent"
										style="width:{i < procSel || (cur && pz) ? '100%' : '0%'};transition:width {cur && pz && !procTouched ? '3.2s' : '.3s'} linear"
									></span>
								</span>
								<span class="text-xs font-bold whitespace-nowrap">{p.n} {p.t}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- 5 · 브랜드 스토리 -->
		<section class={slideCls} aria-label="브랜드가 만들어지는 과정">
			<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
				<div
					class="absolute bottom-[120px] -left-[60px] size-[300px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.22),transparent)] lg:top-1/2 lg:bottom-auto lg:-left-[120px] lg:size-[760px] lg:-translate-y-[55%]"
				></div>
			</div>
			<div class={twoCol}>
				<div class="relative">
					<p class={eyebrowCls}>브랜드가 만들어지는 과정</p>
					<h2 class={h2Cls}>제품이 아니라<br />당신의 이야기를 팔아요</h2>
				</div>
				<div class="{rightCol} mt-6 short:mt-4">
					<div class="flex flex-col">
						{#each STORY as st (st.n)}
							<div class="flex gap-4 border-t border-white/[0.08] py-4 short:py-3">
								<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/[0.14] text-[13px] font-extrabold text-accent">{st.n}</span>
								<div class="min-w-0">
									<div class="text-[17px] font-bold text-fg">{st.t}</div>
									<div class="mt-0.5 text-[13px] leading-[1.45] text-fg/60">{st.d}</div>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 flex flex-wrap gap-1.5">
						{#each SERVICES as s (s)}
							<span class="rounded-full border border-white/[0.12] px-[11px] py-[7px] text-xs font-semibold text-fg/75">{s}</span>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- 6 · 카테고리 -->
		<section class={slideCls} aria-label="브랜드 카테고리">
			<div class={twoCol}>
				<div class="relative">
					<p class={eyebrowCls}>이렇게 브랜드가 태어나요</p>
					<h2 class={h2Cls}>지금 만들어지고 있는<br />브랜드 카테고리</h2>
					<p class="mt-2.5 text-sm text-fg/60 lg:text-[17px]">끌리는 걸 탭하면 그 카테고리로 바로 제조의뢰가 시작돼요</p>
				</div>
				<!-- 4장 2×2 — 카드가 줄어든 만큼 한 장을 키운다 -->
				<div class="{rightCol} mt-6 grid grid-cols-2 gap-2.5 short:mt-4 short:gap-2 lg:ml-auto lg:w-full lg:max-w-[520px] lg:gap-3">
					{#each LANDING_CATEGORIES as c, i (c.title)}
						{@const on = landingPick === i}
						<button
							type="button"
							aria-pressed={on}
							onclick={() => pickCategory(i)}
							class="flex flex-col gap-4 rounded-[20px] border p-4 text-left text-fg hover:border-accent/60 active:scale-[0.97] short:gap-2.5 short:p-3 lg:min-h-[180px] lg:gap-5 lg:rounded-3xl lg:p-5 {on
								? 'border-accent bg-accent/[0.12]'
								: 'border-white/[0.08] bg-white/[0.04]'}"
							style="opacity:{cz ? 1 : 0};transform:{cz ? 'none' : 'translateY(14px)'};transition:border-color .2s,background-color .2s,transform .4s cubic-bezier(.2,.8,.2,1) {0.08 + i * 0.07}s,opacity .4s {0.08 + i * 0.07}s"
						>
							<span class="grid size-14 place-items-center rounded-2xl bg-white/5 text-fg/90 short:size-11 lg:size-16"><TileIcon name={c.icon} size={36} /></span>
							<span>
								<span class="block text-[17px] font-bold short:text-[15px] lg:text-lg">{c.title}</span>
								<span class="mt-1 block text-[13px] leading-[1.45] text-fg/60 short:mt-0.5 short:text-xs">{c.desc}</span>
							</span>
						</button>
					{/each}
				</div>
			</div>
		</section>

		<!-- 7 · 마지막 -->
		<section class={slideCls} aria-label="시작하기">
			<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
				<div
					class="absolute -top-[200px] left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.42),transparent)] lg:-top-[520px] lg:h-[1000px] lg:w-[1600px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,0.38),transparent)]"
				></div>
			</div>
			<div class="{twoCol} flex flex-col lg:grid">
				<div class="relative order-2 lg:order-1">
					<h2 class="text-[32px] leading-[1.22] font-extrabold tracking-[-0.035em] text-balance text-fg lg:text-5xl lg:leading-[1.15]">다음 웰니스 브랜드의<br />주인공은 당신이에요</h2>
					<p class="mt-3.5 text-[15px] leading-[1.65] text-pretty text-fg/70 lg:max-w-[520px] lg:text-lg">제조의뢰를 남기면 전담 매니저가 사흘 안에 연락드려요. 상담은 무료이고, 아무 의무도 생기지 않아요.</p>
				</div>
				<!-- 통계 4칸 — 데스크톱은 카드를 키워 오른쪽 열을 채운다 -->
				<div class="relative order-1 mb-6 grid grid-cols-2 gap-2 short:mb-4 lg:order-2 lg:mb-0 lg:ml-auto lg:w-full lg:max-w-[520px] lg:gap-3">
					{#each FINAL_STATS as f, i (f.label)}
						<div
							class="flex flex-col gap-1.5 rounded-[18px] border border-white/10 bg-white/5 px-4 pt-4 pb-3.5 backdrop-blur-sm lg:min-h-[150px] lg:justify-between lg:gap-3 lg:rounded-3xl lg:p-6"
							style="opacity:{fz ? 1 : 0};transform:{fz ? 'none' : 'translateY(12px)'};transition:opacity .5s {0.1 + i * 0.1}s,transform .5s cubic-bezier(.2,.8,.2,1) {0.1 + i * 0.1}s"
						>
							<div class="flex items-baseline gap-[3px]">
								<span class="text-3xl leading-none font-extrabold tracking-[-0.05em] text-accent tabular-nums lg:text-5xl">{f.big}</span>
								{#if f.unit}<span class="text-[13px] font-bold text-fg/85 lg:text-base">{f.unit}</span>{/if}
							</div>
							<div class="text-xs text-fg/60 lg:text-sm">{f.label}</div>
						</div>
					{/each}
				</div>
			</div>
		</section>
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
				{@render arrow(20)}
			</button>
		</div>
	</div>
</div>
