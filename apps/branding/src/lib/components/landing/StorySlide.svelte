<script lang="ts">
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 5장 · 브랜드가 만들어지는 과정 — 스토리 3줄 + 서비스 칩. */
	let { active }: { active: boolean } = $props();

	const STORY = [
		{ n: '01', t: '컨셉 스토리', d: '당신의 메시지를 브랜드 언어로 바꿔요.' },
		{ n: '02', t: '비주얼 아이덴티티', d: '로고, 패키지, 비주얼 톤까지 함께 잡아요.' },
		{ n: '03', t: '팔로워와의 연결', d: '샵 오픈부터 첫 판매까지 같이 만들어요.' }
	];
	const SERVICES = ['주문·결제 자동화', '포장·출고 대행', '투명한 정산 리포트'];
</script>

<section class={slideCls} aria-label="브랜드가 만들어지는 과정">
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} {rise(active)}" style={d(0)}>브랜드가 만들어지는 과정</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>제품이 아니라<br />당신의 이야기를 팔아요</h2>
		</div>
		<div class="{rightCol} mt-6 short:mt-4">
			<div class="flex flex-col">
				{#each STORY as st, i (st.n)}
					<!-- 줄 사이에만 구분선 — 첫 줄(컨셉 스토리) 위에는 없다 -->
					<div class="flex gap-4 py-4 short:py-3 {i ? 'border-t border-white/[0.08]' : ''} {rise(active)}" style={d(2 + i)}>
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/[0.14] text-[13px] font-extrabold text-accent">{st.n}</span>
						<div class="min-w-0">
							<div class="text-[17px] font-bold text-fg">{st.t}</div>
							<div class="mt-0.5 text-[13px] leading-[1.45] text-fg/60">{st.d}</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="mt-4 flex flex-wrap gap-1.5 {rise(active)}" style={d(5)}>
				{#each SERVICES as s (s)}
					<span class="rounded-full border border-white/[0.12] px-[11px] py-[7px] text-xs font-semibold text-fg/75">{s}</span>
				{/each}
			</div>
		</div>
	</div>
</section>
