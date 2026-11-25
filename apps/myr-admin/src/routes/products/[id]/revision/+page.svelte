<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { products } from '$lib/mock/products.svelte';
	import { PRODUCT_ART, PRODUCT_TILES } from '$lib/product-art';
	import { app } from '$lib/state.svelte';
	import PreviewBox from '$lib/components/PreviewBox.svelte';
	import PreviewCard from '$lib/components/PreviewCard.svelte';
	import PreviewSec from '$lib/components/PreviewSec.svelte';
	import ReviewHead from '$lib/components/ReviewHead.svelte';
	import ReviewInfo from '$lib/components/ReviewInfo.svelte';
	import ReviewMobile from '$lib/components/ReviewMobile.svelte';
	import ReviewPanel from '$lib/components/ReviewPanel.svelte';
	import type { SecNo } from '$lib/mock/types';

	/** 수정 심사(판매 중 상품의 수정본) — docs/myr-admin-screens.md §4-3 (시안 "MYR Admin PC" 상품 · 2026-11-25).
	 *  검수 정보 줄 · 샵 상세 미리보기(바뀐 섹션만 [지금 샵 / 수정본]을 위아래로 · 바뀐 줄은 주황 배경 · 안 바뀐 섹션은 "바뀐 내용 없음" 한 줄)
	 *  · 오른쪽 의견 패널([반려] · [반영 승인] — 둘 다 한 번 더 확인 · 의견이 있으면 반영 승인 잠김). 그사이 상품 상태가 바뀌면 서버가 거절한다 */
	const id = $derived(page.params.id ?? '');
	const r = $derived(products.revision(id));
	let panel = $state<ReturnType<typeof ReviewPanel>>();
	let mobile = $state<ReturnType<typeof ReviewMobile>>();

	/** 심사 버튼 · 의견 — PC 패널과 모바일(의견 목록 · 아래 막대 · 시트)이 같은 값을 쓴다 */
	const reviewProps = $derived({
		id,
		approveLabel: '반영 승인',
		approveSure: '정말 반영하기',
		approveNote: '샵 상세에 바로 반영돼요',
		freeFoot: '반영해도 판매 상태 · 재고 · 옵션은 그대로예요',
		rejectNote: `의견 ${products.opsOf(id).valid}개가 크리에이터에게 전달돼요`,
		onreject: () => finish(products.rejectRevision(id)),
		onapprove: () => finish(products.applyRevision(id))
	});
	const addOp = (k: SecNo) => {
		products.addOp(id, k);
		panel?.focusSel();
		mobile?.openSheet();
	};
	function finish(res: { ok: boolean; msg: string }) {
		if (res.ok) {
			app.showToast(res.msg);
			goto('/products?tab=review');
		}
		return res;
	}
</script>

{#snippet field(f: { t: string; changed: boolean }, cls: string)}
	<span class="rounded-[10px] {f.changed ? 'bg-accent/14 px-2.5 py-1.5' : ''} {cls}">{f.t}</span>
{/snippet}

{#if !r}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">열려 있는 수정본이 없어요</p>
		<p class="mt-1.5 text-[14px] text-white/55">이미 반영 · 반려됐거나 판매 종료된 상품이에요</p>
		<a href="/products?tab=review" class="mt-3 inline-block text-[14px] font-bold text-accent">심사 목록으로</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
		<ReviewHead {r} label="수정 심사" backHref="/products?tab=review" />
		<div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<ReviewInfo {r} />
				<PreviewCard right={r.revSum} rightMobile cat={r.cat} name={r.name} gap="gap-2.5 lg:gap-3">
					{#each r.secs as s (s.k)}
						{#if s.same}
							<div class="flex h-[46px] items-center justify-between gap-3 rounded-[14px] border border-dashed border-white/10 px-4">
								<span class="min-w-0 truncate text-[13px] font-bold text-white/60">{s.label}</span>
								<span class="shrink-0 text-[12.5px] text-white/40">바뀐 내용 없음</span>
							</div>
						{:else}
							<div class="mt-3.5 mb-2">
								<PreviewBox box={s} onop={() => addOp(s.k)}>
									{#if s.k === 1}
										<div class="relative mb-[18px] flex h-[200px] items-center justify-center rounded-[18px] text-fg lg:h-[240px]" style:background={PRODUCT_TILES[r.tile]}>
											<svg width="76" height="76" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html PRODUCT_ART[r.icon] ?? ''}</svg>
											<div class="absolute bottom-3 left-3 flex flex-wrap gap-1.5">{#each r.tags as t (t)}<span class="rounded-full bg-bg/55 px-2.5 py-[5px] text-[12px] font-bold">{t}</span>{/each}</div>
										</div>
									{/if}
									{#each s.sides as sd (sd.label)}
										<div class={sd.on ? 'mt-5 border-t border-dashed border-white/14 pt-[18px]' : ''}>
											<span class="mb-3 inline-block rounded-full px-[9px] py-[3px] text-[11.5px] font-extrabold {sd.on ? 'bg-accent text-bg' : 'bg-white/9 text-white/70'}">{sd.label}</span>
											{#if sd.basic}
												<div class="flex items-center gap-2">
													<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-bg" style:background={r.cr.bg}>{r.cr.initial}</span>
													<span class="text-[14px] font-extrabold">{r.cr.name}</span>
													<span class="text-[13px] text-white/50">{r.cr.handle}</span>
												</div>
												<p class="mt-2.5 text-[22px] leading-[1.3] font-extrabold tracking-[-0.02em]">{@render field(sd.bName, 'inline-block')}</p>
												{#if sd.bIntro}<p class="mt-1.5 text-[14.5px] leading-[1.55] text-white/70">{@render field(sd.bIntro, 'inline-block')}</p>{/if}
												<p class="mt-2 flex items-baseline gap-2">{@render field(sd.bPrice, 'text-[22px] font-extrabold tracking-[-0.02em] tabular-nums')}<span class="text-[13px] text-white/50">{r.unit}</span></p>
												{#if sd.kind}<div class="mt-4"><PreviewSec kind="rows" head={sd.head} items={sd.items} /></div>{/if}
											{:else if sd.kind}
												<PreviewSec kind={sd.kind} head={sd.head} items={sd.items} ing={sd.ing} noteTitle={r.noteTitle} />
											{/if}
										</div>
									{/each}
								</PreviewBox>
							</div>
						{/if}
					{/each}
				</PreviewCard>
				<ReviewMobile bind:this={mobile} {...reviewProps} />
			</div>
			<div class="hidden lg:sticky lg:top-7 lg:block">
				<ReviewPanel bind:this={panel} {...reviewProps} />
			</div>
		</div>
	</div>
{/if}
