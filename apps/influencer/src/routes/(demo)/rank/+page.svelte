<script lang="ts">
	import { S, D_, seller, gradeOf, gname, gfull, platIcon, fmt, GRADES } from '@sellery/core';
	import { Sec, Pyramid, GradeBox } from '@sellery/ui';
	const me = $derived(seller(S.actingSeller)), g = $derived(gradeOf(me.m3Sales)), next = $derived(GRADES[GRADES.indexOf(g) - 1]);
	const pct = $derived(next ? Math.min(100, Math.round(me.m3Sales / next.min * 100)) : 100);
	const rows = $derived(D_().sellers.slice().sort((a, b) => b.m3Sales - a.m3Sales));
</script>

<h2 class="pg">인플루언서 랭킹 <small>최근 3개월 매출 기준 · 등급 보너스는 플랫폼 수수료에서 지급</small></h2>
<div class="grid g2">
	<div class="card"><div class="lbl-sm">내 등급 — 상위 {g.pct}%</div>
		<div class="flex items-center gap-3 flex-wrap" style="margin:8px 0"><span class="gradebox">{@html gfull(g.g)}</span><span class="font-display" style="font-size:25px;font-weight:800">₩{fmt(me.m3Sales)}</span><span style="font-size:12px;color:var(--mute)">최근 3개월</span></div>
		<Pyramid tiers={GRADES} cur={g.g} />
		{#if next}<div class="meter"><span style="width:{pct}%"></span></div><div style="font-size:12px;color:var(--mute);margin-top:7px">다음 등급 <b>{next.g}</b>까지 <b>₩{fmt(next.min - me.m3Sales)}</b> 남음 — 달성 시 {next.perk}</div>{:else}<div style="font-size:12px;color:var(--mute)">최고 등급입니다 · {g.perk}</div>{/if}
	</div>
	<div class="card"><div class="lbl-sm">등급별 혜택</div>
		<div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">{#each GRADES as t}<div class="flex gap-2.5 items-baseline flex-wrap" style="font-size:12.5px;{t.g === g.g ? 'font-weight:800' : ''}"><span class="gradebox sm" style="min-width:86px;text-align:center">{@html gfull(t.g)}</span><span style="color:var(--mute);white-space:nowrap">₩{fmt(t.min)}+</span><span style="flex:1;min-width:140px">{t.perk}</span></div>{/each}</div>
	</div>
</div>
<Sec>리더보드 — 매출 효율 랭킹</Sec>
<div class="tblw"><table>
	<thead><tr><th>#</th><th>인플루언서</th><th>카테고리</th><th class="num">3개월 매출</th><th class="num">매출/팔로워</th><th class="num">매출/좋아요</th><th>등급</th></tr></thead>
	<tbody>{#each rows as s, i}{@const mine = s.id === S.actingSeller}<tr class={mine ? 'merow' : ''}><td class="num">{i + 1}</td><td>{@html platIcon(s)} {#if mine}<b>{s.name} {s.handle}</b> <span class="mebadge">MY</span>{:else}○○○ 인플루언서{/if}</td><td>{s.cat}</td><td class="num">₩{fmt(s.m3Sales)}</td><td class="num">₩{fmt(s.m3Sales / s.followers)}</td><td class="num">₩{fmt(s.m3Sales / s.likesAvg)}</td><td><GradeBox g={gname(s)} /></td></tr>{/each}</tbody>
</table></div>
<p style="font-size:12px;color:var(--mute);margin-top:10px">※ 타 인플루언서는 익명(○○○)으로만 노출됩니다 — 순위와 지표만 공개, 저격 불가.</p>
