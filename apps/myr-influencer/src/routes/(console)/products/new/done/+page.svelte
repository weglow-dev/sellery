<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MODE_COPY } from '$lib/product-edit';
	import { app } from '$lib/state.svelte';
	import Icon from '$lib/components/Icon.svelte';

	/** 심사 요청 완료 — 제출 → 운영팀 검토 → MYR Shop 오픈 세 단계 안내. 방금 제출한 제품이 없으면(주소로 바로 들어옴) 내 제품으로.
	 *  수정 심사(4-2)면 "수정 심사 요청했어요" · 판매는 계속 · 샵에 반영(시안 isEdit · product-edit MODE_COPY).
	 *  모바일: 왼쪽 정렬 + 하단 [내 제품으로] / PC(lg~): 가운데 640px 카드 + [상품 하나 더 등록] [내 제품으로] */
	const name = app.lastSubmitted;
	onMount(() => {
		if (!name) goto('/products', { replaceState: true });
	});

	const copy = MODE_COPY[app.lastSubmitMode];
	const STEPS = copy.doneSteps.map((st, i) => ({ ...st, done: i === 0 }));
</script>

{#if name}
	<div class="flex min-h-0 flex-1 animate-slide-in flex-col lg:block lg:animate-up-in">
		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-16 pb-5 lg:mx-auto lg:max-w-[640px] lg:overflow-visible lg:px-10 lg:pt-[72px] lg:pb-20 lg:text-center">
			<div class="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-accent text-bg lg:mx-auto lg:h-[72px] lg:w-[72px]"><Icon id="check" size={32} sw={2.8} class="lg:h-9 lg:w-9" /></div>
			<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-0.03em] lg:mt-6 lg:text-[36px] lg:leading-[1.25]">{copy.doneTitle}</h1>
			<p class="mt-2.5 text-[15px] leading-[1.6] text-white/65 lg:mt-3 lg:text-[16px]"><b class="font-bold text-fg">{name}</b><br />{copy.doneDesc}</p>

			<ol class="mt-7 flex flex-col lg:mt-8 lg:rounded-3xl lg:border lg:border-white/7 lg:bg-white/3 lg:px-7 lg:pt-6 lg:pb-2.5 lg:text-left">
				{#each STEPS as s, i (s.title)}
					<li class="flex gap-3.5">
						<div class="flex shrink-0 flex-col items-center">
							<span class="box-border flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold {s.done ? 'bg-accent text-bg' : 'border-[1.5px] border-white/30 text-white/80'}">{i + 1}</span>
							{#if i < STEPS.length - 1}<span class="min-h-[22px] w-0.5 flex-1 bg-white/10"></span>{/if}
						</div>
						<div class={i < STEPS.length - 1 ? 'pb-4' : 'lg:pb-3.5'}>
							<p class="mt-0.5 text-[15px] font-bold">{s.title}</p>
							<p class="mt-1 text-[13px] text-white/58">{s.desc}</p>
						</div>
					</li>
				{/each}
			</ol>

			<div class="mt-7 hidden justify-center gap-2.5 lg:flex">
				<a href="/products/new" class="flex h-[54px] items-center rounded-2xl border-[1.5px] border-white/14 px-7 text-[15px] font-bold text-fg transition-colors hover:border-white/35">상품 하나 더 등록</a>
				<a href="/products" class="flex h-[54px] items-center rounded-2xl bg-accent px-7 text-[15px] font-extrabold text-bg">내 제품으로</a>
			</div>
		</div>
		<div class="shrink-0 px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
			<a href="/products" class="flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-extrabold text-bg">내 제품으로</a>
		</div>
	</div>
{/if}
