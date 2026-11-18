<script lang="ts">
	import { MENUS } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import Icon from './Icon.svelte';

	/** UI 단계에서 아직 만들지 않은 메뉴 — 이름 · 설계 위치 · 홈과 같은 할 일 숫자만 보여 준다 */
	let { menu, section, desc }: { menu: string; section: string; desc: string } = $props();
	const m = $derived(MENUS.find((x) => x.key === menu)!);
	const group = $derived(server.homeGroups.find((g) => g.key === menu));
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-8">
	<h1 class="sr-only text-[26px] font-extrabold tracking-[-0.02em] lg:not-sr-only lg:block">{m.name}</h1>
	<div class="mt-2 lg:mt-6 flex flex-col items-center rounded-3xl border border-dashed border-white/15 px-6 py-14 text-center">
		<span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6 text-white/70"><Icon id={m.icon} size={26} /></span>
		<p class="mt-4 text-[17px] font-bold">다음 단계에서 만들어요</p>
		<p class="mt-1.5 max-w-[420px] text-[14px] leading-[1.6] text-white/60">{desc}</p>
		<p class="mt-3 text-[12px] text-white/55">화면 구성 · docs/myr-admin-screens.md {section}</p>
		{#if group?.tasks.length}
			<div class="mt-6 flex flex-wrap justify-center gap-1.5">
				{#each group.tasks as t (t.label)}
					<span class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold {t.tone === 'red' ? 'bg-danger/14 text-danger-fg' : 'bg-white/6 text-white/80'}">{t.label}<span class="tabular-nums">{t.value ?? t.n}</span>{#if t.oldest}<span class="text-[12px] font-semibold text-white/55">· {t.oldest}</span>{/if}</span>
				{/each}
			</div>
		{/if}
	</div>
</div>
