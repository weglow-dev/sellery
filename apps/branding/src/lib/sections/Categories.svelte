<script lang="ts">
	import { reveal } from '../reveal';

	const categories = [
		{ emoji: '🔥', title: '다이어트', desc: '식단 · 대체식 · 체중 관리' },
		{ emoji: '✨', title: '이너뷰티', desc: '콜라겐 · 이너케어' },
		{ emoji: '🧴', title: '더마', desc: '스킨케어 · 바디케어' },
		{ emoji: '💆', title: '헤어 & 바디', desc: '헤어 · 두피 · 바디' },
		{ emoji: '🌙', title: '멘탈 웰니스', desc: '수면 · 스트레스 케어' },
		{ emoji: '💪', title: '맨즈 웰니스', desc: '남성 전용 건강관리' }
	];
</script>

<section use:reveal class="bg-bg py-24 md:py-32">
	<div class="mx-auto max-w-5xl px-5">
		<p data-reveal class="text-[15px] font-bold text-accent">이렇게 브랜드가 태어나요</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mt-3 max-w-xl text-[28px] leading-[1.3] font-extrabold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			지금 만들어지고 있는<br />브랜드 카테고리
		</h2>
		<div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each categories as c, i (c.title)}
				<div
					data-reveal
					style="--reveal-delay: {0.05 * i}s"
					class="group overflow-hidden rounded-3xl border border-line transition duration-300 hover:-translate-y-1 hover:border-white/15"
				>
					<div
						aria-hidden="true"
						class="flex h-28 items-center justify-center text-4xl transition-transform duration-500 group-hover:scale-110"
						style="background: linear-gradient(150deg, #15161c 0%, color-mix(in srgb, var(--color-accent) {14 + i * 3}%, #15161c) 100%)"
					>
						{c.emoji}
					</div>
					<div class="bg-panel p-6">
						<p class="text-lg font-bold text-fg">{c.title}</p>
						<p class="mt-1 text-[14px] text-fg-soft">{c.desc}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
