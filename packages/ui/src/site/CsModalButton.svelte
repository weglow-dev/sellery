<script lang="ts">
	/** 문의 버튼 — 클릭하면 문의하기 모달. 주문 행 `문의` · 주문 상세 `문의하기` (web cs-modal.tsx CsModalButton) */
	import type { Snippet } from 'svelte';
	import CsModal from './CsModal.svelte';
	let {
		class: cls = '',
		children,
		...rest
	}: { class?: string; children?: Snippet; productName: string; thumbUrl: string | null; emoji: string; brandName: string; orderCode?: string | null } = $props();
	let open = $state(false);
</script>

<button type="button" class={cls} onclick={() => (open = true)}>{#if children}{@render children()}{:else}문의{/if}</button>
<CsModal {open} onClose={() => (open = false)} {...rest} />
