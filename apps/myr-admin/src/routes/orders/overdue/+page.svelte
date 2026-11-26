<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	/** 예전 배송 완료 예외 화면(/orders/overdue) — 시안 2026-11-26 부터 주문 목록 배송 중 탭의 줄 칩으로 본다(§6-4). 예전 링크 · 북마크는 그쪽으로(?id= 면 그 주문 상세) */
	onMount(() => {
		const id = page.url.searchParams.get('id');
		goto(id ? `/orders/${encodeURIComponent(id)}` : '/orders?tab=shipping', { replaceState: true });
	});
</script>
