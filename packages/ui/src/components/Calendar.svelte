<script lang="ts">
	/* 판매 캘린더 (js/20-seller.js calHtml) */
	import { S, prod, seller, settleDue, today, ymd, P, go, type Campaign } from '@sellery/core';
	import Sec from './Sec.svelte';
	let { list, brandView = false, title = '판매 캘린더 — 내 스케줄 한눈에' }: { list: Campaign[]; brandView?: boolean; title?: string } = $props();
	const off = $derived(S.ui.calOff || 0);
	const base = $derived(new Date(today().getFullYear(), today().getMonth() + off, 1));
	const y = $derived(base.getFullYear()), m = $derived(base.getMonth());
	const startDow = $derived(new Date(y, m, 1).getDay());
	const dim = $derived(new Date(y, m + 1, 0).getDate());
	const label = (c: Campaign) => (brandView ? `${prod(c.productId).name} · ${seller(c.sellerId).name}` : prod(c.productId).name);
	interface Ev { type: string; name: string; first: boolean; cid: string; go?: string }
	function evFor(date: Date): Ev[] {
		const t = date.getTime(), ds = ymd(date); const out: Ev[] = [];
		list.forEach((c) => {
			if (c.start && ['SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING', 'SETTLED'].includes(c.status)) {
				const s = P(c.start).getTime(), e = P(c.end!).getTime();
				if (t >= s && t <= e) out.push({ type: c.status === 'LIVE' ? 'live' : c.status === 'SCHEDULE_CONFIRMED' ? 'plan' : 'done', name: label(c), first: t === s, cid: c.id });
				if (c.status === 'CLEARING' && ymd(settleDue(c)) === ds) out.push({ type: 'pay', name: '₩ 정산 예정', first: true, cid: c.id, go: 'settle' });
			}
			if (c.status === 'TESTING' && c.testDue === ds) out.push({ type: 'due', name: '테스트 마감', first: true, cid: c.id });
		});
		return out;
	}
	const days = $derived(Array.from({ length: dim }, (_, i) => new Date(y, m, i + 1)));
	const todayS = ymd(today());
</script>

<Sec>{title}</Sec>
<div class="card" style="padding:0;overflow:hidden">
	<div class="cal-head">
		<button class="sm ghost" onclick={() => (S.ui.calOff = off - 1)}>‹</button>
		<b class="font-display" style="font-size:16px;letter-spacing:.02em">{y}.{String(m + 1).padStart(2, '0')}</b>
		<button class="sm ghost" onclick={() => (S.ui.calOff = off + 1)}>›</button>
		{#if off !== 0}<button class="sm ghost" onclick={() => (S.ui.calOff = 0)}>오늘</button>{/if}
		<span class="cal-legend"><span><i class="lg plan"></i>확정</span><span><i class="lg live"></i>LIVE</span><span><i class="lg done"></i>종료·정산중</span><span role="button" tabindex="0" onclick={() => go.screen('settle')} onkeydown={(e) => e.key === 'Enter' && go.screen('settle')} style="cursor:pointer;text-decoration:underline"><i class="lg pay"></i>정산일</span><span><i class="lg due"></i>테스트 마감</span></span>
	</div>
	<div class="cal-dow">{#each ['일', '월', '화', '수', '목', '금', '토'] as d}<span>{d}</span>{/each}</div>
	<div class="cal-grid">
		{#each Array(startDow) as _}<div class="cal-cell off"></div>{/each}
		{#each days as date}
			<div class="cal-cell {ymd(date) === todayS ? 'today' : ''}">
				<span class="dn">{date.getDate()}</span>
				{#each evFor(date) as ev}
					<div class="cal-ev {ev.type}" role="button" tabindex="0" title="{ev.name}{ev.go ? ' — 정산 탭으로' : ''}" onclick={() => (ev.go ? go.screen(ev.go) : go.camp(ev.cid))} onkeydown={(e) => e.key === 'Enter' && (ev.go ? go.screen(ev.go) : go.camp(ev.cid))}>{ev.first ? ev.name : ' '}</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
