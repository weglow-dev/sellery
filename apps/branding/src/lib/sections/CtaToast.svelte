<script lang="ts">
	import { cta } from '../cta.svelte';
</script>

<!-- 제조의뢰 폼이 붙기 전까지의 임시 응답 -->
{#if cta.toastShown}
	<div
		class="motion-safe:animate-toast-in fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-line bg-panel px-5 py-3.5 text-[15px] font-semibold text-fg shadow-2xl shadow-black/50"
	>
		제조의뢰 폼을 준비하고 있어요 · 곧 열려요 🙌
	</div>
{/if}
