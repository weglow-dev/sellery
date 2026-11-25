<script lang="ts">
	import Icon from './Icon.svelte';

	/** 목록 검색칸(시안 · 40px 둥근 입력) — 값은 화면이 들고 있고(bind:value) 서버(목) list() 에 넘긴다 */
	let { value = $bindable(''), placeholder = '검색', label = '검색' }: { value?: string; placeholder?: string; label?: string } = $props();
</script>

<label class="relative block w-full lg:w-[240px]">
	<span class="sr-only">{label}</span>
	<span class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/40"><Icon id="search" size={16} /></span>
	<input bind:value type="search" {placeholder} class="h-10 w-full rounded-full border border-white/10 bg-white/4 pr-4 pl-10 text-[14px] text-fg outline-none transition-colors placeholder:text-white/40 focus:border-accent focus:bg-accent/6" />
</label>
