<script lang="ts">
	import { reveal } from '../reveal';

	const values = [
		{ icon: 'inventory.svg', title: '재고 부담 0', desc: '생산량 결정도, 창고도, 남는 재고도 셀러리가 책임져요.' },
		{ icon: 'cost.svg', title: '제조비용 0', desc: '제조 비용은 셀러리가 먼저 부담, 판매분만 정산해요.' },
		{ icon: 'admin.svg', title: '행정 리스크 0', desc: '인허가, 표시·광고 검토 등 전부 대행해요.' },
		{ icon: 'manager.svg', title: '전담 매니저 1:1', desc: '컨셉부터 론칭까지 담당자가 끝까지 함께해요.' },
		{ icon: 'sample.svg', title: '빠른 샘플 제작', desc: '검증된 제조 파트너와 빠르게 샘플을 확인해요.' }
	];
</script>

<section use:reveal class="bg-bg py-16 md:py-32">
	<div class="mx-auto max-w-5xl px-5">
		<p data-reveal class="text-[15px] font-bold text-accent">부담은 셀러리가</p>
		<h2
			data-reveal
			style="--reveal-delay: 0.06s"
			class="mt-3 max-w-xl text-[28px] leading-[1.3] font-bold tracking-[-0.02em] text-fg md:text-[38px]"
		>
			브랜드를 운영하는 데<br />필요한 모든 걸 준비했어요
		</h2>
		<div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each values as v, i (v.title)}
				<div
					data-reveal
					style="--reveal-delay: {0.06 * i}s"
					class="group rounded-3xl border border-line bg-panel p-7 transition duration-300 hover:-translate-y-1.5 hover:border-white/15"
				>
					<div
						class="grid size-11 place-items-center rounded-2xl bg-accent-soft transition-transform duration-300 group-hover:scale-110"
					>
						<img src="/{v.icon}" alt="" class="size-7" />
					</div>
					<p class="mt-5 text-lg font-bold text-fg">{v.title}</p>
					<p class="mt-2 text-[15px] leading-relaxed text-fg-soft">{v.desc}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
