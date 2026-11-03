<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { app } from '$lib/state.svelte';
	import Icon from '$lib/components/Icon.svelte';

	/** 심사 요청 완료 — 제출 → 운영팀 검토 → MYR Shop 오픈 세 단계 안내. 방금 제출한 제품이 없으면(주소로 바로 들어옴) 내 제품으로 */
	const name = app.lastSubmitted;
	onMount(() => {
		if (!name) goto('/products', { replaceState: true });
	});

	const STEPS = [
		{ title: '제출 완료', desc: '방금 상세페이지가 전달됐어요', done: true },
		{ title: '운영팀 검토', desc: '표시·광고 문구와 성분 표기를 확인해요', done: false },
		{ title: 'MYR Shop 오픈', desc: '승인되면 바로 판매가 시작돼요', done: false }
	];
</script>

{#if name}
	<div class="flex min-h-0 flex-1 animate-slide-in flex-col">
		<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-16 pb-5">
			<div class="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-accent text-bg"><Icon id="check" size={32} sw={2.8} /></div>
			<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-0.03em]">심사 요청했어요</h1>
			<p class="mt-2.5 text-[15px] leading-[1.6] text-white/65"><b class="font-bold text-fg">{name}</b><br />영업일 1~2일 안에 검토 결과를 알려드려요.</p>

			<ol class="mt-7 flex flex-col">
				{#each STEPS as s, i (s.title)}
					<li class="flex gap-3.5">
						<div class="flex shrink-0 flex-col items-center">
							<span class="box-border flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold {s.done ? 'bg-accent text-bg' : 'border-[1.5px] border-white/30 text-white/80'}">{i + 1}</span>
							{#if i < STEPS.length - 1}<span class="min-h-[22px] w-0.5 flex-1 bg-white/10"></span>{/if}
						</div>
						<div class={i < STEPS.length - 1 ? 'pb-4' : ''}>
							<p class="mt-0.5 text-[15px] font-bold">{s.title}</p>
							<p class="mt-1 text-[13px] text-white/58">{s.desc}</p>
						</div>
					</li>
				{/each}
			</ol>
		</div>
		<div class="shrink-0 px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
			<a href="/products" class="flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-extrabold text-bg">내 제품으로</a>
		</div>
	</div>
{/if}
