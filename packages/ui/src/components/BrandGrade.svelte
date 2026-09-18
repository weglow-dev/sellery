<script lang="ts">
	/* 브랜드 등급 피라미드 + 혜택표 (js/40-brand.js brandGradeHtml) */
	import { bGmv, bgradeOf, gfull, fmt, BGRADES, PLAT_RATE, type Brand } from '@sellery/core';
	import Pyramid from './Pyramid.svelte';
	import Sec from './Sec.svelte';
	let { b, compact = false }: { b: Brand; compact?: boolean } = $props();
	const gv = $derived(bGmv(b)), bg = $derived(bgradeOf(gv)), bnext = $derived(BGRADES[BGRADES.indexOf(bg) - 1]);
	const bpct = $derived(bnext ? Math.min(100, Math.round(gv / bnext.min * 100)) : 100);
</script>

{#if compact}<div class="lbl-sm" style="margin:6px 0 10px">브랜드 등급 — 상위 {bg.pct}%</div>{:else}<Sec>브랜드 등급 — 상위 {bg.pct}%</Sec>{/if}
<div class="grid g2">
	<div class="card"><div class="lbl-sm">내 브랜드 등급</div>
		<div class="flex items-center gap-3 flex-wrap" style="margin:8px 0"><span class="gradebox">{@html gfull(bg.g)}</span><span class="font-display" style="font-size:25px;font-weight:800">₩{fmt(gv)}</span><span style="font-size:12px;color:var(--mute)">누적 확정 매출</span></div>
		<Pyramid tiers={BGRADES} cur={bg.g} />
		{#if bnext}<div class="meter" style="margin-top:12px"><span style="width:{bpct}%"></span></div><div style="font-size:12px;color:var(--mute);margin-top:7px">다음 등급 <b>{bnext.g}</b>까지 <b style="color:var(--red)">₩{fmt(bnext.min - gv)}</b> · 달성 시 {bnext.perk.split('·')[0].trim()}</div>
		{:else}<div style="font-size:12px;color:var(--mute);margin-top:8px">최고 등급 · {bg.perk}</div>{/if}
	</div>
	<div class="card"><div class="lbl-sm">등급별 혜택 — 브랜드</div>
		<div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">{#each BGRADES as t}<div class="flex gap-2.5 items-baseline flex-wrap" style="font-size:12.5px;{t.g === bg.g ? 'font-weight:800' : ''}"><span class="gradebox sm" style="min-width:86px;text-align:center">{@html gfull(t.g)}</span><span style="color:var(--mute);white-space:nowrap">₩{fmt(t.min)}+</span><span style="flex:1;min-width:140px">{t.perk}</span></div>{/each}</div>
		<p style="font-size:11.5px;color:var(--mute);margin:12px 0 0">수수료 할인은 플랫폼 중개 수수료({(PLAT_RATE * 100).toFixed(0)}%)에서 차감 · 누적 확정 매출(GMV) 기준</p>
	</div>
</div>
