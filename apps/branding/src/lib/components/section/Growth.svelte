<script lang="ts">
	import { reveal } from '$lib/utils/reveal';

	const growthStats = [
		{ num: '4', unit: '단계', label: '제조의뢰 → 샵 오픈' },
		{ num: '0', unit: '원', label: '초기 비용' },
		{ num: '0', unit: '건', label: '떠안는 재고' },
		{ num: '1:1', unit: '', label: '전담 매니저' }
	];

	const ops = ['주문·결제 자동화', '포장·출고 대행', '투명한 정산 리포트'];
</script>

<section use:reveal class="bg-panel py-20 md:py-36">
	<div data-reveal class="mx-auto max-w-3xl px-5 text-center">
		<p class="text-[15px] font-bold text-accent">GROWTH, SIMPLIFIED</p>
		<h2
			class="mt-4 text-6xl font-extrabold tracking-tighter sm:text-7xl md:text-8xl"
			style="background: linear-gradient(90deg, #fff 0%, #fff 55%, var(--color-accent) 100%); -webkit-background-clip: text; background-clip: text; color: transparent;"
		>
			SELLERY
		</h2>
		<svg viewBox="0 0 600 160" class="mx-auto -mt-4 h-24 w-full max-w-xl md:h-32" fill="none" aria-hidden="true">
			<defs>
				<linearGradient id="growthLine" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
					<stop offset="0" stop-color="var(--color-accent)" stop-opacity="0.15" />
					<stop offset="1" stop-color="var(--color-accent)" />
				</linearGradient>
			</defs>
			<path
				d="M10,130 C100,125 140,90 200,95 C260,100 280,60 340,55 C400,50 420,20 460,18 C500,16 540,25 590,10"
				stroke="url(#growthLine)"
				stroke-width="4"
				stroke-linecap="round"
				pathLength="900"
				stroke-dasharray="900"
				class="reveal-line"
				style="--line-length: 900"
			/>
		</svg>
		<p class="mx-auto mt-2 max-w-sm text-base leading-relaxed text-fg-soft md:text-lg">
			복잡한 과정을 압축한 네 단계. 당신은 브랜드에만 집중하면 돼요.
		</p>

		<div class="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
			{#each growthStats as g (g.label)}
				<div>
					<p class="text-3xl font-extrabold text-fg md:text-4xl">{g.num}<span class="text-lg text-fg-faint">{g.unit}</span></p>
					<p class="mt-1.5 text-sm text-fg-faint">{g.label}</p>
				</div>
			{/each}
		</div>

		<div class="mt-12 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium text-fg-faint">
			{#each ops as o, i (o)}
				{#if i > 0}<span aria-hidden="true" class="text-white/15">·</span>{/if}
				<span>{o}</span>
			{/each}
		</div>
	</div>
</section>
