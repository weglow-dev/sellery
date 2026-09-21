<script lang="ts">
	/** [복사] — navigator.clipboard, 실패하면 코드를 그대로 보여 준다 (web my-client.tsx CopyButton · 프로토타입 copyVcode/copyRef) */
	let { text, label = '복사' }: { text: string; label?: string } = $props();
	let done = $state<null | 'ok' | 'fail'>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			done = 'ok';
		} catch {
			done = 'fail';
		}
		clearTimeout(timer);
		timer = setTimeout(() => (done = null), 1800);
	}
</script>

<button type="button" class="ghost sm" onclick={copy} aria-live="polite">
	{done === 'ok' ? '복사됨 ✓' : done === 'fail' ? `복사 실패 — ${text}` : label}
</button>
