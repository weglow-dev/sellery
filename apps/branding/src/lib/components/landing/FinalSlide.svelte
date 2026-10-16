<script lang="ts">
	import { d, rise, slideCls, twoCol } from './shared';

	/** 7장 · 마지막 — 통계 4칸 + "다음 웰니스 브랜드의 주인공은 당신이에요". */
	let { active }: { active: boolean } = $props();

	const FINAL_STATS = [
		{ big: '4', unit: '단계', label: '제조의뢰 → 샵 오픈' },
		{ big: '0', unit: '원', label: '초기 비용' },
		{ big: '0', unit: '건', label: '떠안는 재고' },
		{ big: '1:1', unit: '', label: '전담 매니저' }
	];
</script>

<section class={slideCls} aria-label="시작하기">
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			class="absolute -top-[200px] left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.42),transparent)] lg:-top-[520px] lg:h-[1000px] lg:w-[1600px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,0.38),transparent)]"
		></div>
	</div>
	<div class="{twoCol} flex flex-col lg:grid">
		<div class="relative order-2 lg:order-1">
			<h2 class="text-[32px] leading-[1.22] font-extrabold tracking-[-0.035em] text-balance text-fg lg:text-5xl lg:leading-[1.15] {rise(active)}" style={d(0)}>다음 웰니스 브랜드의<br />주인공은 당신이에요</h2>
			<p class="mt-3.5 text-[15px] leading-[1.65] text-pretty text-fg/70 lg:max-w-[520px] lg:text-lg {rise(active)}" style={d(1)}>제조의뢰를 남기면 전담 매니저가 사흘 안에 연락드려요. 상담은 무료이고, 아무 의무도 생기지 않아요.</p>
		</div>
		<!-- 통계 4칸 — 데스크톱은 카드를 키워 오른쪽 열을 채운다 -->
		<div class="relative order-1 mb-6 grid grid-cols-2 gap-2 short:mb-4 lg:order-2 lg:mb-0 lg:ml-auto lg:w-full lg:max-w-[520px] lg:gap-3">
			{#each FINAL_STATS as f, i (f.label)}
				<div
					class="flex flex-col gap-1.5 rounded-[18px] border border-white/10 bg-white/5 px-4 pt-4 pb-3.5 backdrop-blur-sm lg:min-h-[150px] lg:justify-between lg:gap-3 lg:rounded-3xl lg:p-6"
					style="opacity:{active ? 1 : 0};transform:{active ? 'none' : 'translateY(12px)'};transition:opacity .5s {0.1 + i * 0.1}s,transform .5s cubic-bezier(.2,.8,.2,1) {0.1 + i * 0.1}s"
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
