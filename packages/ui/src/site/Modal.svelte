<script lang="ts">
	/**
	 * 모달 — 프로토타입 `.modal-bg` + `.modal` (web modal.tsx). 배경 클릭·Esc 로 닫힘, 열려 있는 동안 body 스크롤 잠금, 열릴 때 다이얼로그로 포커스.
	 * URL 은 바꾸지 않는다. 헤더(h3)·본문·`.foot`(우측 정렬 버튼) 슬롯.
	 *   <Modal {open} onClose={() => (open = false)}>{#snippet title()}<Cel /> 셀러리 판매 인증{/snippet}…{#snippet footer()}<button class="pri">닫기</button>{/snippet}</Modal>
	 */
	import type { Snippet } from 'svelte';
	let {
		open,
		onClose,
		title,
		children,
		footer,
		class: cls = ''
	}: { open: boolean; onClose: () => void; title?: Snippet; children?: Snippet; footer?: Snippet; class?: string } = $props();

	const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
	let box = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		box?.focus();
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
		};
	});
</script>

{#if open}
	<div
		class="modal-bg"
		role="presentation"
		onmousedown={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
	>
		<div bind:this={box} class={cls ? `modal ${cls}` : 'modal'} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabindex="-1">
			{#if title}<h3 id={titleId}>{@render title()}</h3>{/if}
			{@render children?.()}
			{#if footer}<div class="foot">{@render footer()}</div>{/if}
		</div>
	</div>
{/if}
