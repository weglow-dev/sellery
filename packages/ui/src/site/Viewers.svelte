<script lang="ts">
	/** "보는 중" 의사난수 (ux-spec §1.10 · web campaign-card.tsx Viewers) — SSR 값은 서버 버킷, 클라이언트에서 20초마다 갱신. offset: 예정 카드 `🔔 알림 {12 + n}명`. */
	import { onMount } from 'svelte';
	import { fmtNum, viewersOf } from '@sellery/db/campaign';
	let { code, offset = 0 }: { code: string; offset?: number } = $props();
	// svelte-ignore state_referenced_locally — SSR 초기값(서버 버킷)만 잡고, 이후는 20초 타이머가 갱신한다
	let n = $state(viewersOf(code));
	onMount(() => {
		const t = window.setInterval(() => (n = viewersOf(code)), 20000);
		return () => window.clearInterval(t);
	});
</script>

<span>{fmtNum(n + offset)}</span>
