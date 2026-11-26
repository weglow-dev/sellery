<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	/** 예전 배송 완료 예외 화면(/orders/overdue) — 2026-11-26 주문 목록 배송 중 탭 안 필터로 합쳤다(§6-4). 예전 링크 · 북마크는 그쪽으로 넘긴다(열린 서랍 ?id= 는 그대로) */
	onMount(() => {
		const id = page.url.searchParams.get('id');
		goto(`/orders?tab=shipping&ship=overdue${id ? `&id=${encodeURIComponent(id)}` : ''}`, { replaceState: true });
	});
</script>
