<script lang="ts">
	import { reveal } from '../reveal';

	const stories = [
		{ no: '01', title: '컨셉 스토리', desc: '당신의 메시지를 브랜드 언어로 바꿔요.', image: 'story.png' },
		{ no: '02', title: '비주얼 아이덴티티', desc: '로고, 패키지, 비주얼 톤까지 함께 잡아요.', image: 'identiti.png' },
		{ no: '03', title: '팔로워와의 연결', desc: '샵 오픈부터 첫 판매까지 같이 만들어요.', image: 'conect.png' }
	];
</script>

<section use:reveal class="bg-bg py-24 md:py-32">
	<div class="mx-auto max-w-5xl px-5">
		<p data-reveal class="text-[15px] font-bold text-accent">브랜드가 만들어지는 과정</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mt-3 max-w-xl text-[28px] leading-[1.3] font-extrabold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			제품이 아니라<br />당신의 이야기를 팔아요
		</h2>
		<div class="mt-12 grid gap-4 sm:grid-cols-3">
			{#each stories as s, i (s.no)}
				<div
					data-reveal
					style="--reveal-delay: {0.08 * i}s"
					class="group relative aspect-[3/4] overflow-hidden rounded-[1.75rem] border border-line bg-panel"
				>
					<img
						src="/{s.image}"
						alt=""
						class="absolute inset-0 size-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105"
					/>
					<!-- 위아래로 어둡게 깔아서 숫자(상단)·텍스트(하단)를 사진 위에서도 읽히게 한다 -->
					<div
						aria-hidden="true"
						class="absolute inset-0"
						style="background: linear-gradient(180deg, rgba(10,11,14,0.78) 0%, rgba(10,11,14,0.2) 38%, rgba(10,11,14,0.3) 58%, rgba(10,11,14,0.92) 100%)"
					></div>
					<p aria-hidden="true" class="absolute top-5 left-6 text-5xl font-extrabold text-white/25">{s.no}</p>
					<div class="absolute inset-x-0 bottom-0 p-6">
						<p class="text-lg font-bold text-fg">{s.title}</p>
						<p class="mt-1.5 text-[14px] leading-relaxed text-fg-soft">{s.desc}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
