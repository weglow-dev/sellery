<script lang="ts">
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 4장 · 진행 과정 — 4단계 카드가 자동으로 넘어가며 아래 게이지가 차오른다. 단계를 탭하면 자동 재생이 멈춘다. */
	let { active }: { active: boolean } = $props();

	const PROCESS = [
		{ n: '01', t: '제조의뢰', stage: '지금 여기', d: '만들고 싶은 제품을 알려주세요. 폼 하나 작성이면 충분해요.' },
		{ n: '02', t: '컨셉 · 샘플', stage: '전담 매니저와', d: '전담 매니저와 브랜드 컨셉을 잡고, 샘플을 직접 받아 확인해요.' },
		{ n: '03', t: '생산 · 입고', stage: '검증된 파트너가', d: '검증된 제조 파트너가 생산하고, 셀러리 물류센터로 바로 입고돼요.' },
		{ n: '04', t: '내 샵 오픈', stage: '판매 시작', d: '내 이름을 건 샵이 열려요. 링크 하나 공유하면 판매 시작이에요.' }
	];
	let procSel = $state(0);
	let procTouched = $state(false);

	// 사용자가 손대기 전까지 PROC_MS 마다 다음 단계로 넘어간다(게이지가 차는 시간과 같은 값).
	// 타이머는 슬라이드에 들어온 순간 0부터 다시 시작해, 현재 단계 게이지가 다 찬 뒤에야 다음 단계로 간다.
	const PROC_MS = 2200;
	$effect(() => {
		if (!active || procTouched) return;
		procSel = 0;
		// 4번이 끝나면 한 프레임 동안 전부 비웠다가(-1) 01번이 0부터 다시 차오른다 — 바로 0으로 돌리면 01번은 이미 100% 라 안 움직인다
		let raf = 0;
		const t = setInterval(() => {
			if (procSel >= 3) {
				procSel = -1;
				raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => (procSel = 0))));
			} else procSel += 1;
		}, PROC_MS);
		return () => {
			clearInterval(t);
			cancelAnimationFrame(raf);
		};
	});
	// 카드에 보여줄 단계 — 리셋 프레임(-1)에는 01번을 그대로 둔다
	const procShown = $derived(PROCESS[Math.max(0, procSel)]);
</script>

<section class={slideCls} aria-label="진행 과정">
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} {rise(active)}" style={d(0)}>진행 과정</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>브랜드가 되기까지,<br />네 단계면 돼요</h2>
		</div>
		<div class="{rightCol} lg:ml-auto lg:w-full lg:max-w-[480px]">
			<div class="relative flex min-h-[168px] flex-col justify-end overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] px-5 pt-[22px] pb-5 {rise(active)}" style={d(2)}>
				<div aria-hidden="true" class="absolute top-1 right-3.5 text-8xl leading-none font-extrabold tracking-[-0.06em] text-accent/[0.12] tabular-nums">{procShown.n}</div>
				{#key procShown}
					<div class="relative motion-safe:animate-step">
						<div class="text-xs font-bold tracking-[0.04em] text-accent">{procShown.stage}</div>
						<div class="mt-1.5 text-2xl font-extrabold tracking-[-0.03em] text-fg">{procShown.t}</div>
						<div class="mt-2 text-sm leading-[1.55] text-pretty text-fg/70">{procShown.d}</div>
					</div>
				{/key}
			</div>
			<div class="mt-3.5 grid grid-cols-4 gap-1.5 {rise(active)}" style={d(3)}>
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
							<!-- 채워질 때만 전환(지난 단계 .3s · 현재 단계 PROC_MS), 비워질 때는 즉시 — 되감기 모션이 없다 -->
							<span
								class="absolute inset-y-0 left-0 bg-accent"
								style="width:{i < procSel || (cur && active) ? '100%' : '0%'};transition:width {i < procSel ? '.3s' : cur && active ? (procTouched ? '.3s' : `${PROC_MS}ms`) : '0s'} linear"
							></span>
						</span>
						<span class="text-xs font-bold whitespace-nowrap">{p.n} {p.t}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</section>
