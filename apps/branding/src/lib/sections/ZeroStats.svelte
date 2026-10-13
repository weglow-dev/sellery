<script lang="ts">
	import { reveal } from '../reveal';
</script>

<section use:reveal class="relative overflow-hidden bg-panel py-24 md:py-32">
	<div class="relative mx-auto max-w-5xl px-5 text-center">
		<p data-reveal class="text-[15px] font-bold text-accent">START WITH ZERO</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mx-auto mt-3 max-w-xl text-[28px] leading-[1.3] font-extrabold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			시작하는 데 필요한 건<br />당신의 이름뿐이에요
		</h2>

		<div data-reveal style="--reveal-delay: 0.16s" class="relative mx-auto mt-16 w-fit">
			<div class="relative grid size-60 place-items-center rounded-full border border-line bg-white/[0.02] md:size-72">
				<div aria-hidden="true" class="absolute inset-7 rounded-full bg-accent/25 blur-3xl"></div>
				<div class="relative text-center">
					<p class="flex items-end justify-center gap-1.5">
						<span
							data-reveal
							data-count-from="120"
							data-count-to="0"
							class="text-6xl font-extrabold tracking-tight text-fg tabular-nums md:text-7xl"
						>
							120
						</span>
						<span class="pb-2.5 text-xl font-bold text-fg-faint">원</span>
					</p>
					<p class="mt-2 text-sm font-bold text-fg-faint">초기 비용</p>
				</div>
			</div>

			<span
				aria-hidden="true"
				class="motion-safe:animate-float absolute top-4 -left-8 rounded-full border border-line bg-panel px-3.5 py-2 text-xs font-bold whitespace-nowrap text-fg-soft shadow-xl shadow-black/40 md:-left-20 md:top-8"
			>
				재고 0박스
			</span>
			<span
				aria-hidden="true"
				class="motion-safe:animate-float-delay absolute top-24 -right-6 rounded-full border border-line bg-panel px-3.5 py-2 text-xs font-bold whitespace-nowrap text-fg-soft shadow-xl shadow-black/40 md:-right-24 md:top-28"
			>
				서류 1장
			</span>
			<span
				aria-hidden="true"
				class="motion-safe:animate-float-delay-2 absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-3.5 py-2 text-xs font-bold whitespace-nowrap text-fg-soft shadow-xl shadow-black/40 md:-bottom-8"
			>
				전담 매니저 1:1
			</span>
		</div>
	</div>
</section>
