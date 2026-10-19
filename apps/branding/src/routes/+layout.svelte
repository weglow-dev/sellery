<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { PIXEL_ID, loadPixel, track } from '$lib/meta-pixel';

	let { children } = $props();

	// 메타 픽셀 — 첫 로드와 클라이언트 내비게이션마다 PageView (PUBLIC_META_PIXEL_ID 없으면 no-op)
	afterNavigate(() => {
		loadPixel();
		track('PageView');
	});
</script>

{#if PIXEL_ID}
	<noscript><img height="1" width="1" style="display:none" alt="" src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} /></noscript>
{/if}

{@render children()}
