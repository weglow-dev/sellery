<script lang="ts">
	import { page } from '$app/state';
	import { copyText } from '$lib/copy';
	import { groupbuys } from '$lib/mock/groupbuys.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import GroupbuyEndModal from '$lib/components/GroupbuyEndModal.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PanelBtn from '$lib/components/PanelBtn.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';
	import Stats from '$lib/components/Stats.svelte';

	/** 공구 링크 상세 — docs/myr-admin-screens.md §9-1(시안 "MYR Admin PC" · "MYR Admin" detail 'link' · 2026-11-27). 공구 링크 목록 줄에서 연다.
	 *  머리(뒤로 · 사진 · "상품 · 공구 링크" · 상품명 · 크리에이터) · 왼쪽 판매 수량 · 판매 금액 · 공구 정보(상품 · 크리에이터 · 기간 · 공구가)
	 *  · 오른쪽 "발행된 공구 링크"(상태 칩 · 링크 주소 [복사] · 종료/예정 안내) · [링크 열기](진행 중) · [강제 종료](종료 전).
	 *  모바일은 칩이 제목 아래 · 링크 칸이 맨 아래 카드 · 버튼은 그 아래(시안). 시안의 "/ 300개" · 남은 수량 · 판매 막대는 서버에 수량 한도가 없어 뺐다.
	 *  숫자 · 칩 · 안내 · 버튼 표시 조건은 서버(목) 값 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(groupbuys.view(id));
	let ending = $state(false);

	const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
</script>

{#snippet linkBox(url: string, note: string)}
	<div class="flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/4 py-2 pr-2 pl-4">
		<span class="min-w-0 flex-1 text-[14px] leading-[1.45] font-semibold break-all text-white/92">{url}</span>
		<button type="button" onclick={() => copyText(url, '공구 링크')} class="h-[34px] shrink-0 rounded-[10px] border border-white/16 bg-white/5 px-[13px] text-[13px] font-bold whitespace-nowrap hover:border-white/40">복사</button>
	</div>
	{#if note}<p class="pt-1 text-[13.5px] leading-normal text-white/50">{note}</p>{/if}
{/snippet}

{#snippet actions()}
	{#if v && (v.canOpen || v.canEnd)}
		<div class="flex gap-2">
			{#if v.canOpen}<PanelBtn tone="line" onclick={() => open(v.url)}>링크 열기</PanelBtn>{/if}
			{#if v.canEnd}<PanelBtn tone="danger" onclick={() => (ending = true)}>강제 종료</PanelBtn>{/if}
		</div>
	{/if}
{/snippet}

{#if !v}
	<div class="px-5 py-20 text-center lg:pt-24">
		<p class="text-[17px] font-bold">공구 링크를 찾을 수 없어요</p>
		<a href="/products/groupbuys" class="mt-3 inline-block text-[14px] font-bold text-accent">공구 링크 목록으로</a>
	</div>
{:else}
	<div class="animate-up-in px-5 pb-12 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-16">
		<!-- 머리 -->
		<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:min-h-[52px] lg:flex-nowrap">
			<a href="/products/groupbuys?tab={v.tab}" aria-label="공구 링크 목록으로" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
			<ProductThumb tile={v.thumb.tile} icon={v.thumb.icon} size={48} radius={14} />
			<div class="min-w-0 flex-1 lg:flex-none">
				<p class="text-[12.5px] font-semibold text-white/50">{v.crumb}</p>
				<h1 class="truncate text-[22px] font-extrabold tracking-[-0.03em] lg:text-[28px]">{v.title}</h1>
			</div>
			<span class="hidden flex-1 lg:block"></span>
			<div class="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
				<!-- 모바일만 상태 칩을 제목 아래에(PC 는 오른쪽 링크 칸 머리) -->
				{#each v.chips as c (c.label)}<span class="lg:hidden"><Chip label={c.label} tone={c.tone} lg /></span>{/each}
				<span class="ml-1 text-[13px] text-white/50 lg:ml-0 lg:text-[14px]">{v.sub}</span>
			</div>
		</div>

		<div class="mt-5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<DetailCard><Stats items={v.stats} /></DetailCard>
				<DetailCard title="공구 정보">
					<dl>
						{#each v.info as r (r.k)}
							<div class="flex min-h-[38px] items-center justify-between gap-4 text-[15px]"><dt class="shrink-0 text-white/60">{r.k}</dt><dd class="min-w-0 text-right font-semibold tabular-nums">{r.v}</dd></div>
						{/each}
					</dl>
				</DetailCard>
				<!-- 모바일 — 링크 칸은 맨 아래 카드(칩 없이) -->
				<div class="lg:hidden">
					<DetailCard title="발행된 공구 링크">{@render linkBox(v.url, v.note)}</DetailCard>
				</div>
			</div>

			<!-- PC 오른쪽 패널 -->
			<aside class="hidden flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-6 lg:sticky lg:top-7 lg:flex">
				<DetailCard title="발행된 공구 링크" chips={v.chips} plain>{@render linkBox(v.url, v.note)}</DetailCard>
				{@render actions()}
			</aside>

			<!-- 모바일 버튼 — 맨 아래 -->
			{#if v.canOpen || v.canEnd}<div class="lg:hidden">{@render actions()}</div>{/if}
		</div>
	</div>

	{#if ending}
		<GroupbuyEndModal id={v.id} desc={v.desc} onclose={() => (ending = false)} />
	{/if}
{/if}
