<script lang="ts">
	import { startApply } from '../cta.svelte';

	let scrollY = $state(0);
	const scrolled = $derived(scrollY > 8);
</script>

<svelte:window bind:scrollY />

<header
	class="fixed inset-x-0 top-0 z-50 transition-all duration-300 {scrolled
		? 'border-b border-line bg-bg/85 backdrop-blur-xl'
		: 'border-b border-transparent bg-transparent'}"
>
	<div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
		<a href="/" class="flex items-center gap-2 text-[17px] font-bold tracking-tight text-fg">
			<span class="grid size-7 place-items-center rounded-lg bg-accent text-sm font-extrabold text-bg">B</span>
			Sellery&nbsp;Branding
		</a>
		<button
			onclick={startApply}
			class="md:rounded-xl rounded-lg bg-accent px-4 py-2 text-sm font-bold text-bg transition hover:bg-accent-deep active:scale-95"
		>
			제조의뢰 시작하기
		</button>
	</div>
</header>
