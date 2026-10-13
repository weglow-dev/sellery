<script lang="ts">
	import { reveal } from '../reveal';
	import { startApply } from '../cta.svelte';
</script>

<section use:reveal class="relative overflow-hidden bg-bg">
	<!-- 궤도형 데코 그래픽 -->
	<div aria-hidden="true" class="pointer-events-none absolute top-1/2 right-[25rem] hidden -translate-y-1/2 md:block">
		<div class="relative size-100">
			<div class="absolute inset-10 rounded-full bg-accent/20 blur-[90px]"></div>
			<svg viewBox="0 0 400 400" class="motion-safe:animate-spin-reverse absolute inset-0 size-full" fill="none">
				<ellipse cx="200" cy="200" rx="190" ry="70" stroke="white" stroke-opacity="0.08" stroke-width="1" />
				<circle cx="390" cy="200" r="5" fill="var(--color-accent)" />
			</svg>
			<svg
				viewBox="0 0 400 400"
				class="motion-safe:animate-spin-slow absolute inset-0 size-full"
				fill="none"
				style="animation-duration: 54s"
			>
				<ellipse
					cx="200"
					cy="200"
					rx="145"
					ry="145"
					stroke="white"
					stroke-opacity="0.1"
					stroke-width="1"
					transform="rotate(35 200 200)"
				/>
				<circle cx="200" cy="55" r="4" fill="white" fill-opacity="0.65" />
			</svg>
			<svg
				viewBox="0 0 400 400"
				class="motion-safe:animate-spin-reverse absolute inset-0 size-full"
				fill="none"
				style="animation-duration: 70s"
			>
				<ellipse
					cx="200"
					cy="200"
					rx="100"
					ry="40"
					stroke="var(--color-accent)"
					stroke-opacity="0.35"
					stroke-width="1.5"
					transform="rotate(-20 200 200)"
				/>
				<circle cx="300" cy="170" r="3.5" fill="var(--color-accent)" />
			</svg>
		</div>
	</div>

	<div class="relative mx-auto max-w-5xl px-5 pt-36 pb-28 md:pt-44 md:pb-36">
		<p
			data-reveal
			class="mb-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-3.5 py-1.5 text-[13px] font-semibold text-fg-soft"
		>
			<span class="size-1.5 rounded-full bg-accent"></span>
			인플루언서 전용 브랜드 메이킹
		</p>
		<h1
			data-reveal
			style="--reveal-delay: 0.08s"
			class="max-w-2xl text-[40px] leading-[1.16] font-extrabold tracking-[-0.02em] text-fg md:text-[60px]"
		>
			팔로워가 있다면,<br />브랜드도 가질 수 있어요
		</h1>
		<p data-reveal style="--reveal-delay: 0.16s" class="mt-6 max-w-lg text-lg leading-relaxed text-accent">
			다이어트, 이너뷰티, 더마 — 내 이름을 건 웰니스 브랜드. <br class="hidden md:block"/>
			만드는 일도, 쌓이는 재고도, 복잡한 행정도 전부 셀러리가 맡을게요.
		</p>
		<div data-reveal style="--reveal-delay: 0.24s" class="mt-9 flex flex-wrap items-center gap-3">
			<button
				onclick={startApply}
				class="rounded-2xl bg-accent px-7 py-4 text-[17px] font-bold text-bg shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-deep hover:shadow-xl hover:shadow-accent/30 active:scale-95"
			>
				제조의뢰 시작하기
			</button>
			<a
				href="#how"
				class="rounded-2xl border border-line px-6 py-4 text-[17px] font-semibold text-fg-soft transition hover:border-white/20 hover:bg-white/[0.04] active:scale-95"
			>
				어떻게 진행되나요?
			</a>
		</div>
	</div>
</section>
