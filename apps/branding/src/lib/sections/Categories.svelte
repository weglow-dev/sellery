<script lang="ts">
	import { reveal } from '../reveal';

	const categories = [
		{ image: 'diet.png', title: '다이어트', desc: '식단 · 대체식 · 체중 관리' },
		{ image: 'inner.png', title: '이너뷰티', desc: '콜라겐 · 이너케어' },
		{ image: 'mental.png', title: '멘탈 웰니스', desc: '수면 · 스트레스 케어' },
		{ image: 'mans.png', title: '맨즈 웰니스', desc: '남성 전용 건강관리' }
	];
</script>

<section use:reveal class="bg-bg py-16 md:py-32">
	<div class="mx-auto max-w-5xl px-5">
		<p data-reveal class="text-[15px] font-bold text-accent">이렇게 브랜드가 태어나요</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mt-3 max-w-xl text-[28px] leading-[1.3] font-bold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			지금 만들어지고 있는<br />브랜드 카테고리
		</h2>
		<!-- 모바일에서도 처음부터 2열(2행) 그리드 — 좁은 화면에서 계속 넘겨야 하는 슬라이드 대신 한눈에 보이게 -->
		<div class="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-5 lg:grid-cols-4">
			{#each categories as c, i (c.title)}
				<div
					data-reveal
					style="--reveal-delay: {0.05 * i}s"
					class="group relative aspect-4/5 overflow-hidden rounded-2xl border border-line bg-panel transition duration-300 hover:-translate-y-1 hover:border-white/15 sm:rounded-3xl"
				>
					<img
						src="/{c.image}"
						alt=""
						class="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
					/>
					<!-- 위는 투명, 아래로 갈수록 어두워져서 사진 위 텍스트가 읽히게 한다 -->
					<div
						aria-hidden="true"
						class="absolute inset-0"
						style="background: linear-gradient(180deg, transparent 35%, rgba(10,11,14,0.65) 65%, rgba(10,11,14,0.95) 100%)"
					></div>
					<div class="absolute inset-x-0 bottom-0 p-3.5 sm:py-6 sm:pl-5">
						<p class="text-sm font-bold text-fg sm:text-lg">{c.title}</p>
						<p class="mt-0.5 text-[11px] text-fg-soft sm:mt-1 sm:text-[14px]">{c.desc}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
