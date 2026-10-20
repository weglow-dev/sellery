<script lang="ts">
	import { d, rise, slideCls, twoCol } from './shared';

	/** 7장 · 마지막 — 통계 4칸 + "다음 웰니스 브랜드의 주인공은 당신이에요". 카드가 떠오르며 숫자가 굴러 멈춘다. */
	let { active }: { active: boolean } = $props();

	// from → to 로 굴러간다. 4단계는 0 에서 올라가고, 0원 · 0건은 2장과 짝을 맞춰 예전 값에서 내려오고, 1:1 은 0:0 에서 맞춰진다
	const FINAL_STATS = [
		{ from: 0, to: 4, fmt: (n: number) => String(n), unit: '단계', label: '제조의뢰 → 샵 오픈' },
		{ from: 3000, to: 0, fmt: (n: number) => n.toLocaleString('ko-KR'), unit: '원', label: '초기 비용' },
		{ from: 300, to: 0, fmt: (n: number) => String(n), unit: '건', label: '재고 부담' },
		{ from: 0, to: 1, fmt: (n: number) => `${n}:${n}`, unit: '', label: '전담 매니저' }
	];
	const COUNT_MS = 900;

	let vals = $state(FINAL_STATS.map((s) => s.from));

	// 카드가 떠오르는 시차(0.1초 간격)에 맞춰 숫자를 굴린다 — 떠나면 처음 값으로 되돌려 다음에 다시 굴린다
	$effect(() => {
		if (!active) {
			vals = FINAL_STATS.map((s) => s.from);
			return;
		}
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const timers: number[] = [];
		const frames: number[] = [];
		FINAL_STATS.forEach((s, i) => {
			timers.push(
				window.setTimeout(() => {
					if (reduce) {
						vals[i] = s.to;
						return;
					}
					const start = performance.now();
					const tick = (now: number) => {
						const p = Math.min(1, (now - start) / COUNT_MS);
						const eased = 1 - Math.pow(1 - p, 3); // 처음엔 빠르게, 끝에서 천천히
						vals[i] = Math.round(s.from + (s.to - s.from) * eased);
						if (p < 1) frames[i] = requestAnimationFrame(tick);
					};
					frames[i] = requestAnimationFrame(tick);
				}, (0.25 + i * 0.1) * 1000)
			);
		});
		return () => {
			timers.forEach(clearTimeout);
			frames.forEach(cancelAnimationFrame);
		};
	});
</script>

<section class={slideCls} aria-label="시작하기">
	<div class="{twoCol} flex flex-col lg:grid">
		<div class="relative order-2 lg:order-1">
			<h2 class="text-[32px] leading-[1.22] font-extrabold tracking-[-0.035em] text-balance text-fg lg:text-5xl lg:leading-[1.15] {rise(active)}" style={d(0)}>다음 웰니스 브랜드의<br />주인공은 당신이에요</h2>
			<p class="mt-3.5 text-[15px] leading-[1.65] text-pretty text-fg/70 lg:max-w-[520px] lg:text-lg {rise(active)}" style={d(1)}>제조의뢰를 남기면 전담 매니저가 사흘 안에 연락드려요. 상담은 무료이고, 아무 의무도 생기지 않아요.</p>
		</div>
		<!-- 통계 4칸 — 데스크톱은 카드를 키워 오른쪽 열을 채운다 -->
		<div class="relative order-1 mb-6 grid grid-cols-2 gap-2 short:mb-4 lg:order-2 lg:mb-0 lg:ml-auto lg:w-full lg:max-w-[520px] lg:gap-3">
			{#each FINAL_STATS as s, i (s.label)}
				{@const done = vals[i] === s.to}
				<div
					class="flex flex-col gap-1.5 rounded-[18px] border border-white/10 bg-white/5 px-4 pt-4 pb-3.5 backdrop-blur-sm lg:min-h-[150px] lg:justify-between lg:gap-3 lg:rounded-3xl lg:p-6"
					style="opacity:{active ? 1 : 0};transform:{active ? 'none' : 'translateY(12px)'};transition:opacity .5s {0.1 + i * 0.1}s,transform .5s cubic-bezier(.2,.8,.2,1) {0.1 + i * 0.1}s"
				>
					<div class="flex items-baseline gap-[3px]">
						<!-- 굴러가는 동안은 흐린 흰색, 멈추면 포인트색 -->
						<span class="text-3xl leading-none font-extrabold tracking-[-0.05em] tabular-nums transition-colors duration-300 lg:text-5xl {done ? 'text-accent' : 'text-fg/70'}">{s.fmt(vals[i])}</span>
						{#if s.unit}<span class="text-[13px] font-bold text-fg/85 lg:text-base">{s.unit}</span>{/if}
					</div>
					<div class="text-xs text-fg/60 lg:text-sm">{s.label}</div>
				</div>
			{/each}
		</div>
	</div>
</section>
