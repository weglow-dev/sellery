<script lang="ts">
	import { onMount } from 'svelte';

	/** 상품 페이지 큰 사진 — 부모(타일 칸 · relative)를 가득 채운다. 여러 장이면 옆으로 넘겨보기:
	 *  모바일 = 손가락으로 밀기(scroll-snap) + 오른쪽 아래 "1/3" / PC(lg~) = 좌우 화살표(마우스를 올리면) + 같은 번호. PC 아래 썸네일 줄은 페이지가 그리고 go(i) 로 옮긴다.
	 *  첫 장만 바로 불러오고(LCP) 나머지는 lazy. 사진이 없으면 이 컴포넌트를 쓰지 않는다(타일 + 아이콘). */
	let { images, alt, index = $bindable(0) }: { images: string[]; alt: string; index?: number } = $props();

	let track: HTMLDivElement | undefined = $state();
	// 다른 상품으로 넘어가면(페이지가 {#key} 로 새로 만든다) 첫 장부터
	onMount(() => (index = 0));
	const many = $derived(images.length > 1);

	function onscroll() {
		if (!track || !track.clientWidth) return;
		index = Math.min(images.length - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)));
	}
	/** i 번째 사진으로(썸네일 · 화살표) */
	export function go(i: number) {
		if (!track) return;
		const n = (i + images.length) % images.length;
		track.scrollTo({ left: n * track.clientWidth, behavior: 'smooth' });
		index = n;
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') go(index + 1);
		else if (e.key === 'ArrowLeft') go(index - 1);
		else return;
		e.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={track}
	{onscroll}
	onkeydown={many ? onkeydown : undefined}
	tabindex={many ? 0 : undefined}
	role={many ? 'region' : undefined}
	aria-roledescription={many ? '사진 넘겨보기' : undefined}
	aria-label={many ? `${alt} 사진 ${images.length}장` : undefined}
	class="no-bar absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none"
>
	{#each images as src, i (src)}
		<img {src} alt={many ? `${alt} 사진 ${i + 1}` : alt} class="h-full w-full shrink-0 snap-center object-cover" loading={i === 0 ? 'eager' : 'lazy'} draggable="false" />
	{/each}
</div>

{#if many}
	<span class="pointer-events-none absolute right-3 bottom-3.5 rounded-full bg-bg/60 px-2.5 py-1 text-[12px] font-bold tabular-nums backdrop-blur-md lg:right-5 lg:bottom-5" aria-hidden="true">{index + 1}/{images.length}</span>
	<button type="button" onclick={() => go(index - 1)} aria-label="이전 사진" class="absolute top-1/2 left-4 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-bg/55 text-fg opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:flex">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
	</button>
	<button type="button" onclick={() => go(index + 1)} aria-label="다음 사진" class="absolute top-1/2 right-4 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-bg/55 text-fg opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:flex">
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
	</button>
{/if}
