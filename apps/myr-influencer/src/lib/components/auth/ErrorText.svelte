<script lang="ts">
	/** 칸 아래 오류 한 줄 — 주황 · 느낌표 아이콘 · 나타날 때 살짝 흔들림(시안 shake). id 는 입력 칸의 aria-describedby 가 가리킨다 */
	let { id = undefined, text }: { id?: string; text: string } = $props();
</script>

<p {id} class="m-0 flex animate-shake items-center gap-1.5 text-[12px] font-semibold text-accent">
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>
	{text}
</p>
