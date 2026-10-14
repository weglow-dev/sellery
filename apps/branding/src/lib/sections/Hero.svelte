<script lang="ts">
	import Constellation from '../Constellation.svelte';
	import { reveal } from '../reveal';
	import { startApply } from '../cta.svelte';
</script>

<section use:reveal class="relative overflow-hidden bg-bg">
	<!-- 컨스텔레이션 데코 — 커서를 따라 점·선이 이어진다 -->
	<div aria-hidden="true" class="pointer-events-none absolute top-1/2 right-[28rem] hidden -translate-y-1/2 md:block">
		<div class="relative size-100">
			<div class="absolute inset-10 rounded-full bg-accent/20 blur-[90px]"></div>
			<Constellation />
		</div>
	</div>

	<div class="relative mx-auto max-w-5xl px-5 pt-32 pb-20 md:pt-44 md:pb-36">
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
			class="max-w-2xl text-[40px] leading-[1.16] font-bold tracking-[-0.02em] text-fg md:text-[60px]"
		>
			팔로워가 있다면,<br />브랜드도 가질 수 있어요
		</h1>
		<p data-reveal style="--reveal-delay: 0.16s" class="mt-6 max-w-lg text-lg leading-relaxed text-accent">
			다이어트, 이너뷰티, 멘탈·맨즈 웰니스 — 내 이름을 건 브랜드. <br class="hidden md:block"/>
			만드는 일도, 쌓이는 재고도, 복잡한 행정도 전부 셀러리가 맡을게요.
		</p>
		<div data-reveal style="--reveal-delay: 0.24s" class="mt-9 flex flex-wrap items-center gap-3">
			<button
				onclick={startApply}
				class="rounded-xl md:rounded-2xl bg-accent px-4 md:px-7 py-3 md:py-4 text-[17px] font-bold text-bg shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-deep hover:shadow-xl hover:shadow-accent/30 active:scale-95"
			>
				제조의뢰 시작하기
			</button>
			<a
				href="#how"
				class="rounded-xl md:rounded-2xl border border-line px-4 md:px-6 py-3 md:py-4 text-[17px] font-semibold text-fg-soft transition hover:border-white/20 hover:bg-white/[0.04] active:scale-95"
			>
				어떻게 진행되나요?
			</a>
		</div>
	</div>
</section>
