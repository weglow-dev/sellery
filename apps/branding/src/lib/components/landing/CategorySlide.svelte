<script lang="ts">
	import TileIcon from '../TileIcon.svelte';
	import { LANDING_CATEGORIES } from '$lib/utils/apply-options';
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 6장 · 제품 카테고리 — 타일 4장(2×2). 탭하면 살짝 커지며 체크 배지가 튀어나온 뒤 그 카테고리로 퍼널이 시작된다(onpick). 테두리가 한 장씩 돌아가며 반짝인다. */
	let { active, onpick }: { active: boolean; onpick: (category: string) => void } = $props();

	// 선택 표시를 잠깐 보여준 뒤 그 카테고리로 퍼널을 시작한다
	let landingPick = $state<number | null>(null);
	let pickTimer: ReturnType<typeof setTimeout> | undefined;
	function pickCategory(i: number) {
		landingPick = i;
		clearTimeout(pickTimer);
		pickTimer = setTimeout(() => onpick(LANDING_CATEGORIES[i].category), 260);
	}
	$effect(() => () => clearTimeout(pickTimer));

	// 테두리 반짝임 — 슬라이드가 보이는 동안 1.6초마다 한 장씩, 한 바퀴에 전부 한 번씩(섞은 순서 · 연속 같은 장 없음).
	// 마우스를 올리면 멈추고 떼면 다시 돌며, 탭해서 고르면(landingPick) 그대로 멈춘다.
	let blinkIdx = $state<number | null>(null);
	let blinkPaused = $state(false);
	$effect(() => {
		if (!active || blinkPaused || landingPick !== null) {
			blinkIdx = null;
			return;
		}
		const n = LANDING_CATEGORIES.length;
		let order: number[] = [];
		let last = -1;
		const next = () => {
			if (order.length === 0) {
				order = [...Array(n).keys()].sort(() => Math.random() - 0.5);
				if (n > 1 && order[0] === last) order.push(order.shift()!);
			}
			last = order.shift()!;
			blinkIdx = last;
		};
		const first = setTimeout(next, 700); // 타일 등장 연출이 끝난 뒤부터
		const timer = setInterval(next, 1600);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
			blinkIdx = null;
		};
	});
</script>

<section class={slideCls} aria-label="제품 카테고리">
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} {rise(active)}" style={d(0)}>이런 제품이 만들어지고 있어요</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>지금 만들어지고 있는<br />제품 카테고리</h2>
			<p class="mt-2.5 text-sm text-accent lg:text-[17px] {rise(active)}" style={d(2)}>끌리는 걸 탭하면 그 카테고리로 바로 제조의뢰가 시작돼요</p>
		</div>
		<!-- 4장 2×2 — 카드가 줄어든 만큼 한 장을 키운다 -->
		<div
			role="presentation"
			onpointerenter={(e) => e.pointerType === 'mouse' && (blinkPaused = true)}
			onpointerleave={() => (blinkPaused = false)}
			class="{rightCol} mt-6 grid grid-cols-2 gap-2.5 short:mt-4 short:gap-2 lg:ml-auto lg:w-full lg:max-w-[520px] lg:gap-3"
		>
			{#each LANDING_CATEGORIES as c, i (c.title)}
				{@const on = landingPick === i}
				<button
					type="button"
					aria-pressed={on}
					onclick={() => pickCategory(i)}
					class="group relative flex flex-col gap-4 rounded-[20px] border p-4 text-left text-fg hover:border-accent/60 active:scale-[0.97] short:gap-2.5 short:p-3 lg:min-h-[180px] lg:gap-5 lg:rounded-3xl lg:p-5 {on
						? 'z-10 scale-[1.03] border-accent bg-accent/[0.12]'
						: 'border-white/[0.08] bg-white/[0.04]'} {blinkIdx === i && !on ? 'motion-safe:animate-blink' : ''}"
					style="opacity:{active ? 1 : 0};transform:{active ? 'none' : 'translateY(14px)'};transition:border-color .2s,background-color .2s,scale .22s cubic-bezier(.3,1.6,.5,1),transform .4s cubic-bezier(.2,.8,.2,1) {0.08 + i * 0.07}s,opacity .4s {0.08 + i * 0.07}s"
				>
					<!-- 호버하면 아이콘 칸에 옅은 주황이 들고 아이콘이 살짝 커지며 포인트색으로 — 터치 기기엔 영향 없음 -->
					<span class="grid size-14 place-items-center rounded-2xl bg-white/5 text-fg/90 transition-colors duration-300 group-hover:bg-accent/15 group-hover:text-accent short:size-11 lg:size-16">
						<span class="flex transition-transform duration-300 ease-out group-hover:scale-110"><TileIcon name={c.icon} size={36} /></span>
					</span>
					<span>
						<span class="block text-[17px] font-bold short:text-[15px] lg:text-lg">{c.title}</span>
						<span class="mt-1 block text-[13px] leading-[1.45] text-fg/60 short:mt-0.5 short:text-xs">{c.desc}</span>
					</span>
					<!-- 탭하면 퍼널로 넘어가는 0.26초 동안 타일이 살짝 커지고(scale) 체크 배지가 톡 튀어나온다 — 퍼널 TileGroup 과 같은 배지 -->
					{#if on}
						<span class="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-accent motion-safe:animate-pop short:top-2.5 short:right-2.5 lg:top-4 lg:right-4">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</section>
