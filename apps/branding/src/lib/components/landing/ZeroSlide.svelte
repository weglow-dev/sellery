<script lang="ts">
	import ArrowIcon from './ArrowIcon.svelte';
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 2장 · START WITH ZERO — 예전 비용에 취소선이 그어지고, 오른쪽 숫자가 예전 값에서 0 으로 빠르게 줄어든다(카운트다운). */
	let { active }: { active: boolean } = $props();

	// from → to 로 줄어들고, 다 내려가면 final 문구("0원")로 바뀐다. unit 은 내려가는 동안 붙는 단위
	const ZERO_ROWS = [
		{ label: '초기 비용', was: '₩ 3,000만', from: 3000, to: 0, unit: '만', final: '0원' },
		{ label: '재고 부담', was: '300박스', from: 300, to: 0, unit: '박스', final: '0박스' },
		{ label: '준비할 서류', was: '12장', from: 12, to: 1, unit: '장', final: '1장' }
	];
	const COUNT_MS = 1100;

	let vals = $state(ZERO_ROWS.map((r) => r.from));
	let shownRows = $state(ZERO_ROWS.map(() => false));

	// 슬라이드가 보이면 줄마다 시차(취소선이 그어진 직후)를 두고 카운트다운 — 떠나면 처음 값으로 되돌려 다음에 다시 센다
	$effect(() => {
		if (!active) {
			vals = ZERO_ROWS.map((r) => r.from);
			shownRows = ZERO_ROWS.map(() => false);
			return;
		}
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const timers: number[] = [];
		const frames: number[] = [];
		ZERO_ROWS.forEach((r, i) => {
			timers.push(
				window.setTimeout(() => {
					shownRows[i] = true;
					if (reduce) {
						vals[i] = r.to;
						return;
					}
					const start = performance.now();
					const tick = (now: number) => {
						const p = Math.min(1, (now - start) / COUNT_MS);
						const eased = 1 - Math.pow(1 - p, 3); // 처음엔 빠르게, 끝에서 천천히
						vals[i] = Math.round(r.from + (r.to - r.from) * eased);
						if (p < 1) frames[i] = requestAnimationFrame(tick);
					};
					frames[i] = requestAnimationFrame(tick);
				}, (0.55 + i * 0.35) * 1000)
			);
		});
		return () => {
			timers.forEach(clearTimeout);
			frames.forEach(cancelAnimationFrame);
		};
	});
</script>

<section class={slideCls} aria-label="초기 비용">
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} tracking-[0.08em] {rise(active)}" style={d(0)}>START WITH ZERO</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>시작하는 데 필요한 건<br />내 이름뿐이에요</h2>
		</div>
		<div class="{rightCol} {rise(active)}" style={d(2)}>
			<div class="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-[18px] py-1 lg:ml-auto lg:max-w-[480px] lg:rounded-[26px] lg:px-[26px] lg:py-2">
				{#each ZERO_ROWS as r, i (r.label)}
					{@const done = vals[i] === r.to}
					<div class="flex items-center gap-3 py-3.5 lg:gap-3.5 lg:py-[26px] {i ? 'border-t border-white/[0.07]' : ''}">
						<span class="flex-1 text-sm font-semibold text-fg/70 lg:text-base">{r.label}</span>
						<span class="relative text-[15px] font-bold whitespace-nowrap text-fg/40 tabular-nums lg:text-[17px]">
							{r.was}
							<span class="absolute top-1/2 left-0 h-0.5 bg-accent" style="width:{active ? '100%' : '0%'};transition:width .5s cubic-bezier(.2,.8,.2,1) {0.25 + i * 0.35}s"></span>
						</span>
						<ArrowIcon size={14} class="text-white/35" />
						<!-- 줄어드는 동안은 예전 단위로(2,480만 · 137박스 · 7장), 다 내려가면 최종 문구(0원) -->
						<span
							class="min-w-[38px] text-right text-[22px] font-extrabold tracking-[-0.04em] tabular-nums transition-[opacity,color] duration-300 lg:min-w-[60px] lg:text-[32px] {done
								? 'text-accent'
								: 'text-fg/80'}"
							style="opacity:{shownRows[i] ? 1 : 0}"
							aria-live="off"
						>
							{done ? r.final : `${vals[i].toLocaleString('ko-KR')}${r.unit}`}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>
