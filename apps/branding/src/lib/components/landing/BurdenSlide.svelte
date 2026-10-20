<script lang="ts">
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 3장 · 부담은 셀러리가 — "내가 할 일" 칸의 짐이 "셀러리가 할 일" 칸으로 하나씩 건너가는 표. 칩을 누르면 아래 설명이 바뀐다. */
	let { active }: { active: boolean } = $props();

	const BURDENS = [
		{ t: '재고 부담', n: '0', d: '생산량 결정도, 창고도, 남는 재고도 셀러리가 책임져요.' },
		{ t: '제조비용', n: '0', d: '제조 비용은 셀러리가 먼저 부담, 판매분만 정산해요.' },
		{ t: '행정 리스크', n: '0', d: '인허가, 표시·광고 검토 등 전부 대행해요.' },
		{ t: '전담 매니저', n: '1:1', d: '컨셉부터 론칭까지 담당자가 끝까지 함께해요.' },
		{ t: '샘플 제작', n: '빠름', d: '검증된 제조 파트너와 빠르게 샘플을 확인해요.' }
	];
	let burdenSel = $state(0);

	// lg(1024px) 이상인지 — 칩이 건너가는 거리가 열 간격(모바일 8px · 데스크톱 12px)에 맞게 바뀐다
	let desktop = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 1024px)');
		const sync = () => (desktop = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	// 다른 슬라이드처럼 아래 정렬하되 모바일에서 아래 여백을 조금 줘 살짝 올라와 보이게 한다
	const twoColLift = `${twoCol} mb-2 lg:mb-0`;
</script>

<section class={slideCls} aria-label="셀러리가 맡는 일">
	<div class={twoColLift}>
		<div class="relative">
			<p class="{eyebrowCls} {rise(active)}" style={d(0)}>부담은 셀러리가</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>브랜드를 운영하는 데<br />필요한 모든 걸 준비했어요</h2>
		</div>
		<div class="{rightCol} mt-4 short:mt-3.5 lg:ml-auto lg:w-full lg:max-w-[560px] {rise(active)}" style={d(2)}>
			<div class="grid grid-cols-2 gap-2 text-[13px] font-bold tracking-[0.04em] short:text-xs lg:gap-3 lg:text-[13px]">
				<div class="px-1 text-fg/45">내가 할 일</div>
				<div class="flex items-center gap-1.5 px-1 text-accent"><span class="size-1.5 rounded-full bg-accent"></span>셀러리가 할 일</div>
			</div>
			<div class="mt-2 flex flex-col gap-2 short:mt-1.5 short:gap-1 lg:mt-2.5 lg:gap-2">
				{#each BURDENS as b, i (b.t)}
					{@const on = burdenSel === i}
					<div class="relative grid grid-cols-2 gap-2 lg:gap-3">
						<!-- 칩이 떠난 왼쪽 칸: 떠나는 시점(이동 시작)부터 옅은 주황 잔상이 남았다 사라진다 -->
						<div
							class="h-14 rounded-[14px] border border-dashed border-white/10 short:h-[42px] short:rounded-xl {active ? 'motion-safe:animate-cell-afterglow' : ''}"
							style="animation-delay:{0.3 + i * 0.3}s"
						></div>
						<div class="h-14 rounded-[14px] border border-dashed border-white/10 short:h-[42px] short:rounded-xl"></div>
						<!-- 슬라이드가 보이면 "내가 할 일" 칸의 짐이 "셀러리가 할 일" 칸으로 하나씩 건너가고, 도착하는 순간(이동 .55초 뒤) 한 번 번쩍인다 -->
						<button
							type="button"
							aria-pressed={on}
							onclick={() => (burdenSel = i)}
							class="absolute top-0 left-0 flex h-14 w-[calc(50%-4px)] items-center justify-between rounded-[14px] border px-4 text-[15px] font-bold short:h-[42px] short:rounded-xl short:px-3 short:text-xs lg:w-[calc(50%-6px)] {on
								? 'border-accent bg-accent/[0.14] text-accent'
								: 'border-white/[0.12] bg-panel text-fg/85'} {active ? 'motion-safe:animate-chip-flash' : ''}"
							style="transform:{active ? `translateX(calc(100% + ${desktop ? 12 : 8}px))` : 'none'};transition:transform .55s cubic-bezier(.2,.8,.2,1) {0.3 + i * 0.3}s,background-color .3s,border-color .3s,color .3s;animation-delay:{0.3 + i * 0.3 + 0.5}s"
						>
							<span>{b.t}</span><span class="text-[13px] font-extrabold opacity-80 short:text-xs">{b.n}</span>
						</button>
					</div>
				{/each}
			</div>
			<div class="mt-2.5 grid grid-cols-2 items-stretch gap-2 short:mt-2 lg:mt-3 lg:gap-3">
				<div
					class="rounded-2xl bg-accent p-[18px] text-[15px] leading-[1.35] font-extrabold text-bg short:rounded-[14px] short:p-2.5 short:text-xs"
					style="opacity:{active ? 1 : 0};transform:{active ? 'none' : 'translateY(8px)'};transition:opacity .5s 1.9s,transform .5s cubic-bezier(.2,.8,.2,1) 1.9s"
				>
					브랜드에만<br />집중하기
				</div>
				<div class="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-[18px] text-[13px] leading-relaxed text-fg/75 short:rounded-[14px] short:p-2.5 short:text-[11px] short:leading-normal">{BURDENS[burdenSel].d}</div>
			</div>
		</div>
	</div>
</section>
