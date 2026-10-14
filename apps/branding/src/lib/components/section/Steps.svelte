<script lang="ts">
	import { reveal } from '$lib/utils/reveal';

	const steps = [
		{ no: '01', title: '제조의뢰', desc: '만들고 싶은 제품을 알려주세요. 폼 하나 작성이면 충분해요.' },
		{ no: '02', title: '컨셉 · 샘플', desc: '전담 매니저와 브랜드 컨셉을 잡고, 샘플을 직접 받아 확인해요.' },
		{ no: '03', title: '생산 · 입고', desc: '검증된 제조 파트너가 생산하고, 셀러리 물류센터로 바로 입고돼요.' },
		{ no: '04', title: '내 샵 오픈', desc: '내 이름을 건 샵이 열려요. 링크 하나 공유하면 판매 시작이에요.' }
	];
</script>

<section id="how" use:reveal class="scroll-mt-16 bg-panel py-24 md:py-32">
	<div class="mx-auto max-w-5xl px-5">
		<p data-reveal class="text-[15px] font-bold text-accent">진행 과정</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mt-3 max-w-xl text-[28px] leading-[1.3] font-bold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			브랜드가 되기까지,<br />네 단계면 돼요
		</h2>
		<div class="mt-12 grid gap-4 md:grid-cols-4">
			{#each steps as s, i (s.no)}
				<div
					data-reveal
					style="--reveal-delay: {0.08 * i}s"
					class="rounded-3xl border border-line p-7 transition duration-300 hover:border-accent/50 hover:bg-accent-soft/10"
				>
					<p class="text-sm font-extrabold text-fg-faint">{s.no}</p>
					<p class="mt-3 text-lg font-bold text-fg">{s.title}</p>
					<p class="mt-2 text-[15px] leading-relaxed text-fg-soft">{s.desc}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
