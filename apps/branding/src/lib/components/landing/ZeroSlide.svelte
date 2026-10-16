<script lang="ts">
	import ArrowIcon from './ArrowIcon.svelte';
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 2장 · START WITH ZERO — 예전 비용에 취소선이 그어지고 0 이 톡 튀어나오는 표. */
	let { active }: { active: boolean } = $props();

	const ZERO_ROWS = [
		{ label: '초기 비용', was: '₩ 3,000만', now: '0원' },
		{ label: '재고 부담', was: '300박스', now: '0박스' },
		{ label: '준비할 서류', was: '12장', now: '1장' }
	];
</script>

<section class={slideCls} aria-label="초기 비용">
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} tracking-[0.08em] {rise(active)}" style={d(0)}>START WITH ZERO</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>시작하는 데 필요한 건<br />당신의 이름뿐이에요</h2>
		</div>
		<div class="{rightCol} {rise(active)}" style={d(2)}>
			<div class="rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-[18px] py-1 lg:ml-auto lg:max-w-[480px] lg:rounded-[26px] lg:px-[26px] lg:py-2">
				{#each ZERO_ROWS as r, i (r.label)}
					<div class="flex items-center gap-3 py-3.5 lg:gap-3.5 lg:py-[26px] {i ? 'border-t border-white/[0.07]' : ''}">
						<span class="flex-1 text-sm font-semibold text-fg/70 lg:text-base">{r.label}</span>
						<span class="relative text-[15px] font-bold whitespace-nowrap text-fg/40 tabular-nums lg:text-[17px]">
							{r.was}
							<span class="absolute top-1/2 left-0 h-0.5 bg-accent" style="width:{active ? '100%' : '0%'};transition:width .5s cubic-bezier(.2,.8,.2,1) {0.25 + i * 0.35}s"></span>
						</span>
						<ArrowIcon size={14} class="text-white/35" />
						<span
							class="min-w-[38px] text-right text-[22px] font-extrabold tracking-[-0.04em] text-accent tabular-nums lg:min-w-[60px] lg:text-[32px]"
							style="opacity:{active ? 1 : 0};transform:{active ? 'none' : 'scale(.6)'};transition:opacity .4s {0.55 + i * 0.35}s,transform .4s cubic-bezier(.3,1.4,.5,1) {0.55 + i * 0.35}s"
						>
							{r.now}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>
