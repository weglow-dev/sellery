<script lang="ts">
	/** 인플루언서 아바타 `.sc-av` — 이미지 없으면 👤 (web campaign-card.tsx SellerAvatar) */
	import { imageSrc } from '@sellery/db/campaign';
	let { avatarUrl, size }: { avatarUrl: string | null; size: number } = $props();
	const src = $derived(imageSrc(avatarUrl));
</script>

{#if src}<span class="sc-av" style="width:{size}px;height:{size}px;background-image:url({src})" aria-hidden="true"></span>{:else}<span class="sc-av em" style="width:{size}px;height:{size}px;font-size:{Math.round(size / 2)}px" aria-hidden="true">👤</span>{/if}
