<script lang="ts">
	/* 앱바(워드마크 + 우측 슬롯) · 서브내비(탭) · 메인 · 모달 · 토스트 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { setNavigate, autoTick } from '@sellery/core';
	import { onMount } from 'svelte';
	import Wordmark from './Wordmark.svelte';
	import Toasts from './Toasts.svelte';
	import ModalHost from '../modals/ModalHost.svelte';
	interface Tab { href: string; label: string; badge?: number }
	let { tabs = [], right, persona, children }: { tabs?: Tab[]; right?: Snippet; persona?: Snippet; children: Snippet } = $props();
	setNavigate((p) => goto(base + p)); // 앱은 /brand 같은 base 아래에 있으므로 core 가 말하는 화면 경로에 접두
	onMount(() => autoTick()); // 마운트 후 실행 — init 중 상태 변경 금지
	const path = $derived(page.url.pathname.slice(base.length) || '/');
	const isOn = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
</script>

<div class="appbar">
	<Wordmark />
	<nav class="roletabs" id="roletabs"></nav>
	<div class="master">{#if right}{@render right()}{/if}</div>
</div>
<div class="subnav" id="subnav">
	{#each tabs as t}
		<a href={base + t.href} class="{isOn(t.href) ? 'on' : ''} relative inline-block no-underline" style="text-decoration:none" role="button">
			<button class={isOn(t.href) ? 'on' : ''} style="position:relative" tabindex="-1">{t.label}{#if t.badge}<span class="badge">{t.badge}</span>{/if}</button>
		</a>
	{/each}
	{#if persona}{@render persona()}{/if}
</div>
<main id="main">{@render children()}</main>
<ModalHost />
<Toasts />
