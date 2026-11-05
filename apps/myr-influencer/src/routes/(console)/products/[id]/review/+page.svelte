<script lang="ts">
	import { goto } from '$app/navigation';
	import { goBack } from '$lib/nav';
	import { REVIEW_COPY, rejectItemLabel, reviewWhen } from '$lib/product-review';
	import { won } from '$lib/rules';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 심사 결과 — 반려 · 수정 반려된 상품의 운영팀 의견(섹션별 · 시안 REJECT DETAIL). [수정하고 다시 요청하기] → 에디터 반려 고치기(8단계 · ?id).
	 *  수정 반려면 "지금 샵에서는 기존 상세페이지로 판매되고 있어요".
	 *  모바일: 60px 헤더(시각) · 본문 · 하단 버튼 / PC(lg~): 32px 제목 줄 + 2단(왼쪽 의견 · 오른쪽 400px 상품 카드 + 버튼) */
	let { data } = $props();
	const copy = $derived(REVIEW_COPY[data.kind]);
	const when = $derived(reviewWhen(data.reviewedAt));
	const fix = () => goto(`/products/new?id=${encodeURIComponent(data.product.id)}`);
</script>

{#snippet liveNote(cls: string)}
	{#if data.kind === 'rev'}
		<div class="flex items-center gap-2 rounded-[14px] border border-mint/20 bg-mint/8 px-3.5 py-3 text-[13px] leading-normal text-white/78 {cls}">
			<span class="h-2 w-2 shrink-0 rounded-full bg-mint"></span>지금 샵에서는 기존 상세페이지로 판매되고 있어요
		</div>
	{/if}
{/snippet}

<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:block lg:w-full lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-7 lg:pb-10">
	<BackHeader title="심사 결과" fallback="/products">
		{#snippet right()}<span class="text-[12px] text-white/45">{when}</span>{/snippet}
	</BackHeader>

	<!-- PC 제목 줄 -->
	<div class="hidden items-center gap-3 lg:flex">
		<PcBack onclick={() => goBack('/products')} />
		<h1 class="text-[32px] font-extrabold tracking-[-0.03em]">심사 결과</h1>
		<span class="rounded-[7px] bg-[#ff6b6b]/14 px-[9px] py-1 text-[12px] font-extrabold text-[#ff8a8a]">{copy.chip}</span>
		<span class="ml-auto text-[13px] text-white/45">{when}</span>
	</div>

	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-8 lg:mt-7 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8 lg:overflow-visible lg:p-0">
		<div class="min-w-0">
			<span class="inline-flex rounded-[7px] bg-[#ff6b6b]/14 px-[9px] py-1 text-[12px] font-extrabold text-[#ff8a8a] lg:hidden">{copy.chip}</span>
			<h2 class="mt-3 text-[26px] leading-[1.3] font-extrabold tracking-[-0.025em] lg:mt-0">{copy.title}</h2>
			<p class="mt-2 text-[14px] leading-[1.55] text-white/60 lg:text-[15px] lg:leading-[1.6]">{copy.desc}</p>

			<!-- 모바일 상품 카드 -->
			<div class="mt-5 flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 lg:hidden">
				<Tile tile="slate" thumbUrl={data.product.thumbUrl} bg={data.product.tile} iconId={data.product.icon} icon={32} class="h-14 w-14 rounded-[14px]" />
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-bold">{data.product.name}</span>
					<span class="mt-[3px] block text-[12px] text-white/55">{data.product.price ? won(data.product.price) : '가격 미정'}</span>
				</span>
			</div>
			{@render liveNote('mt-2.5 lg:hidden')}

			<p class="mt-7 mb-2.5 text-[13px] font-extrabold text-white/80 lg:mb-3 lg:text-[14px]">운영팀 의견 <span class="text-[#ff8a8a]">{data.items.length}건</span></p>
			<ol class="flex flex-col gap-2.5 lg:gap-3">
				{#each data.items as it, i (i)}
					<li class="rounded-[18px] border border-white/8 bg-white/3 p-4 lg:rounded-[20px] lg:px-6 lg:py-5">
						<div class="flex items-center gap-2 lg:gap-2.5">
							<span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#ff6b6b]/14 text-[11px] font-extrabold text-[#ff8a8a] lg:h-[26px] lg:w-[26px] lg:text-[12px]">{i + 1}</span>
							<span class="text-[13px] font-extrabold lg:text-[15px]">{rejectItemLabel(it)}</span>
						</div>
						<p class="mt-2.5 text-[14px] leading-[1.6] text-white/80 lg:mt-3 lg:ml-9 lg:text-[15px] lg:leading-[1.65]">{it.msg}</p>
					</li>
				{/each}
			</ol>
		</div>

		<!-- PC 오른쪽 상품 카드 + 버튼 -->
		<aside class="hidden flex-col gap-3.5 rounded-3xl border border-white/8 bg-[#111216] p-6 lg:flex">
			<div class="flex items-center gap-3.5">
				<Tile tile="slate" thumbUrl={data.product.thumbUrl} bg={data.product.tile} iconId={data.product.icon} icon={40} class="h-[72px] w-[72px] rounded-[18px]" />
				<span class="min-w-0 flex-1">
					<span class="block text-[16px] leading-[1.35] font-extrabold">{data.product.name}</span>
					<span class="mt-1 block text-[13px] text-white/55">{data.product.price ? won(data.product.price) : '가격 미정'}</span>
				</span>
			</div>
			{@render liveNote('')}
			<div class="h-px bg-white/7"></div>
			<p class="text-[13px] leading-[1.6] text-white/60">의견을 반영해 고친 뒤 다시 요청하면, 운영팀이 고친 부분을 중심으로 다시 확인해요.</p>
			<button type="button" onclick={fix} class="h-14 rounded-2xl bg-accent text-[16px] font-extrabold text-bg">수정하고 다시 요청하기</button>
		</aside>
	</div>

	<BottomBar>
		<button type="button" onclick={fix} class="h-14 flex-1 rounded-2xl bg-accent text-[16px] font-extrabold text-bg">수정하고 다시 요청하기</button>
	</BottomBar>
</div>
