<script lang="ts">
	import TileIcon from '../TileIcon.svelte';
	import ArrowIcon from './ArrowIcon.svelte';
	import { d, eyebrowCls, rise, slideCls, twoCol } from './shared';

	/** 1장 · 히어로 — 헤드라인 + (데스크톱) 떠 있는 제형 카드 6장. onnext 는 "옆으로 넘겨 보기" 힌트. */
	let { active, onnext }: { active: boolean; onnext: () => void } = $props();

	// 떠 있는 제형 카드 — 살짝씩 기울여 흩어 놓고, 젤리 하나만 포인트 색
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
</script>

<section class={slideCls} aria-label="소개">
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			class="absolute top-5 -right-20 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.35),transparent)] lg:-top-[200px] lg:-right-[170px] lg:size-[780px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,0.5),rgba(255,122,61,0.16)_55%,transparent)] lg:opacity-85"
		></div>
		<div class="absolute top-16 left-6 text-[150px] leading-none font-extrabold tracking-[-0.06em] text-white/5 select-none lg:top-auto lg:-right-5 lg:bottom-10 lg:left-auto lg:text-[260px]">YOU</div>
	</div>
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} tracking-[0.02em] {rise(active)}" style={d(0)}>오직 나만 팔 수 있는 제품</p>
			<!-- tabindex=-1: 퍼널에서 [홈으로]·로고로 랜딩에 돌아오면 퍼널이 여기로 포커스를 옮긴다(첫 로드에는 옮기지 않는다) -->
			<h1 tabindex="-1" class="mt-3 text-[38px] leading-[1.2] font-extrabold tracking-[-0.035em] text-balance text-fg outline-none lg:text-6xl lg:leading-[1.12] {rise(active)}" style={d(1)}>팔로워가 있다면,<br />나만의 제품을<br />만들 수 있어요</h1>
			<p class="mt-[18px] text-[15px] leading-[1.65] text-pretty text-accent lg:max-w-[520px] lg:text-lg {rise(active)}" style={d(2)}>
				다이어트, 이너뷰티 — 성분부터 맛까지 내가 고른 나만의 레시피. 만드는 일도, 쌓이는 재고도, 복잡한 행정도 전부 Make Your Recipe가 맡을게요.
			</p>
			<button type="button" onclick={onnext} class="mt-[22px] flex items-center gap-2 text-[13px] font-semibold text-fg/50 hover:text-fg/80 {rise(active)}" style={d(3)}>
				<span class="lg:hidden">옆으로 넘겨 어떻게 진행되는지 보기</span>
				<span class="hidden lg:inline">화살표나 트랙패드로 넘겨보세요</span>
				<ArrowIcon size={16} />
			</button>
		</div>
		<!-- 데스크톱에만: 떠 있는 제형 카드 6장 -->
		<div class="hidden min-w-0 lg:block {rise(active)}" style={d(2)}>
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
