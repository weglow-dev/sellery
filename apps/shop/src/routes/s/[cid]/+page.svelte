<script lang="ts">
	/* 판매 링크 진입 — 링크 유입 보호(같은 상품·카테고리 타 판매 비노출)를 브라우저에 기억 */
	import { page } from '$app/state';
	import { camp, setLinkCtx } from '@sellery/core';
	import { Store } from '@sellery/ui';
	const cid = $derived(page.params.cid!);
	$effect(() => { if (camp(cid)) setLinkCtx(cid); });
</script>

<Store {cid} back="/" />
