<script lang="ts">
	import { ctaOn, footCls } from './shared';

	/** [다음 →] 푸터 — 이전으로 돌아왔을 때 이미 답이 있던 질문 화면에만(show) 보인다 */
	let { show, onnext }: { show: boolean; onnext: () => void } = $props();
</script>

{#if show}
	<div class={footCls}>
		<button type="button" onclick={onnext} class={ctaOn}>
			<span>다음</span>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</button>
	</div>
{/if}
