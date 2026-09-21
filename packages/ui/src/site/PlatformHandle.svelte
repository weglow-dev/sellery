<script lang="ts">
	/**
	 * 인플루언서 표기 `**{name}** {platIcon} {handle}` (web platform-handle.tsx).
	 * DB `sellers.handle` 은 '@' 를 포함하므로 그대로 보여 준다 (URL 에는 normalizeHandle(), 여기서는 표시만).
	 */
	import PlatIcon from './icons/PlatIcon.svelte';
	let { platform, handle, name = null, class: cls = '' }: { platform: string | null | undefined; handle: string; name?: string | null; class?: string } = $props();
</script>

<span class={cls ? `who-cell ${cls}` : 'who-cell'}>{#if name}<b>{name}</b>{' '}{/if}<PlatIcon {platform} /><span class="hd">{handle}</span></span>
