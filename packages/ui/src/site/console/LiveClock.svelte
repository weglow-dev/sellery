<script lang="ts">
	/**
	 * 실시간 시계 — "2026.10.08 (수) 14:23:05" 를 1초마다 갱신한다 (대표 요청 2026-10-08, 인플루언서 홈 상단).
	 * SSR 에서는 서버 시각으로 한 번 그리고(hydration 불일치를 피하려고 초 단위는 비움), 브라우저에서 setInterval 로 움직인다.
	 * 표시는 항상 서울 시간(Asia/Seoul) — 사용자 기기 시간대와 무관하게 서비스 기준 시각을 보여준다.
	 */
	let { tz = 'Asia/Seoul' }: { tz?: string } = $props();

	const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
	function parts(d: Date) {
		const f = new Intl.DateTimeFormat('ko-KR', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			weekday: 'short'
		});
		const o: Record<string, string> = {};
		for (const p of f.formatToParts(d)) o[p.type] = p.value;
		const wd = o.weekday ? o.weekday.replace('요일', '') : DAYS[d.getDay()];
		return { date: `${o.year}.${o.month}.${o.day} (${wd})`, time: `${o.hour === '24' ? '00' : o.hour}:${o.minute}:${o.second}` };
	}

	let now = $state(new Date());
	let mounted = $state(false);
	$effect(() => {
		mounted = true;
		now = new Date();
		const id = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(id);
	});
	const p = $derived(parts(now));
</script>

<span class="liveclock" aria-live="off">
	<span class="lc-date">{p.date}</span>
	<span class="lc-time" class:lc-live={mounted}>{mounted ? p.time : '--:--:--'}</span>
</span>
