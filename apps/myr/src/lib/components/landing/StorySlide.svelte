<script lang="ts">
	import { d, eyebrowCls, h2Cls, rightCol, rise, slideCls, twoCol } from './shared';

	/** 5장 · 당신만의 제품이 되는 과정 — 스토리 3줄 + 서비스 칩. ("브랜드를 만들어 준다" 프레임은 2026-10-22 개발팀 요청으로 빼고 "내가 정하는 나만의 제품"으로 — 말투는 랜딩의 1인칭("내 샵" "내가 할 일")에 맞추고 설명 줄은 주어를 뺀다) */
	let { active }: { active: boolean } = $props();

	const STORY = [
		{ n: '01', t: '나만의 레시피', d: '성분, 제형, 맛까지 직접 골라요.' },
		{ n: '02', t: '패키지 · 라벨', d: '패키지와 라벨도 내 스타일대로 함께 잡아요.' },
		{ n: '03', t: '팔로워와의 연결', d: '내 채널에서만 파는 샵, 첫 판매까지 같이 만들어요.' }
	];
	const SERVICES = ['주문·결제 자동화', '포장·출고 대행', '투명한 정산 리포트'];
</script>

<section class={slideCls} inert={!active} aria-label="나만의 제품이 되는 과정">
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
		<div
			class="absolute bottom-[120px] -left-[60px] size-[300px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,0.22),transparent)] lg:top-1/2 lg:bottom-auto lg:-left-[120px] lg:size-[760px] lg:-translate-y-[55%]"
		></div>
	</div>
	<div class={twoCol}>
		<div class="relative">
			<p class="{eyebrowCls} {rise(active)}" style={d(0)}>나만의 제품이 되는 과정</p>
			<h2 class="{h2Cls} {rise(active)}" style={d(1)}>레시피부터 패키지까지,<br />전부 내가 정해요</h2>
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
