<script lang="ts">
	import type { Snippet } from 'svelte';
	let { ey, avatar = '', onAvatar, children, sub }: { ey: string; avatar?: string; onAvatar?: () => void; children: Snippet; sub?: Snippet } = $props();
	const src = $derived(avatar && avatar.startsWith('assets/') ? '/' + avatar : avatar);
</script>

<div class="hero-band">
	{#if src}<img class="hero-av" {src} alt="프로필" onclick={onAvatar} style="cursor:pointer" title="마이페이지" />{/if}
	<div class="ey">{ey}</div>
	<h1>{@render children()}</h1>
	{#if sub}<div class="sub">{@render sub()}</div>{/if}
</div>
<div class="overlap" style="height:0"></div>
