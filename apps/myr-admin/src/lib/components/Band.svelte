<script lang="ts">
	/** 경고 띠 — 목록 위 한 줄(시안 band · 빨강 = 정산 전에 확인 · 주황 = 안내) */
	let { tone = 'orange', text }: { tone?: 'red' | 'orange'; text: string } = $props();
</script>

<div class="rounded-[18px] border px-4 py-3.5 text-[13.5px] leading-[1.5] font-bold lg:rounded-[20px] lg:px-5 lg:py-4 lg:text-[14px] {tone === 'red' ? 'border-danger/28 bg-danger/8 text-danger-fg' : 'border-accent/25 bg-accent/8 text-[#ff9a66]'}">{text}</div>
