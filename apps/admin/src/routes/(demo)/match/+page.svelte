<script lang="ts">
	import { D_, growthOf, autoMatches, gname, bgname, celBal, platIcon, fmt, CEL, act } from '@sellery/core';
	import { Sec, GradeBox, CampRow } from '@sellery/ui';
	const rising = $derived(D_().sellers.map((s) => ({ s, g: growthOf(s) })).sort((a, b) => b.g - a.g).slice(0, 6));
	const cands = $derived(autoMatches());
	const autoCs = $derived(D_().campaigns.filter((c) => c.auto));
</script>

<h2 class="pg">매칭·자동 제안 <small>요즘 뜨는 인플루언서를 브랜드 상품과 자동 매칭 · 브랜드별 자동 제안 ON/OFF</small></h2>
<div class="grid g2">
	<div class="card">
		<div class="lbl-sm" style="margin-bottom:4px">📈 요즘 뜨는 인플루언서</div>
		<div style="font-size:11px;color:var(--mute);margin-bottom:12px">최근 게시물 반응 성장률 (후반 평균 vs 전반 평균) · 관리자는 비공개 인플루언서도 실명 표시</div>
		{#each rising as { s, g }, i}<div class="hb-row" style="cursor:default"><span class="hb-nm">{i + 1}. {@html platIcon(s)} {s.name} {s.handle}{#if s.hidden} <span class="st gray" style="animation:none">비공개</span>{/if} <GradeBox g={gname(s)} /></span><div class="hb-track"><div class="hb-bar {i === 0 ? 'top' : ''}" style="width:{Math.max(6, Math.min(100, g / Math.max(1, rising[0].g) * 100))}%"></div></div><span class="hb-val" style="color:var(--red)">▲{g.toFixed(1)}%</span></div>{/each}
	</div>
	<div class="card">
		<div class="lbl-sm" style="margin-bottom:10px">🤖 브랜드 자동 제안 설정</div>
		{#each D_().brands as b}<div class="rowitem" style="cursor:default"><div class="grow"><div class="nm">{b.name} <GradeBox g={bgname(b)} /></div><div class="sub">{b.cat} · 노출 상품 {D_().products.filter((p) => p.brandId === b.id && p.status === 'listed').length}개 · 보유 {@html CEL} {celBal(b.id)}</div></div><button class="sm {b.autoPropose ? 'pri' : 'ghost'}" onclick={() => act.toggleAutoPropose(b.id)}>{b.autoPropose ? '자동 제안 ON' : '자동 제안 OFF'}</button></div>{/each}
		<p style="font-size:12px;color:var(--mute);margin:10px 0 0">ON이면 매일 카테고리 적합도 × 성장세 × 매출/팔로워 점수로 상위 인플루언서에게 브랜드 명의로 자동 제안합니다. 다이아·블랙 대상은 브랜드 셀러리 {@html CEL} 10이 자동 차감되고, 부족하면 보류됩니다.</p>
	</div>
</div>
<Sec badge={cands.length}>자동 제안 후보</Sec>
<div class="card" style="padding:0;overflow:hidden">
	<div class="flex justify-between items-center gap-2.5 flex-wrap" style="padding:14px 18px 6px"><div style="font-size:12.5px;color:var(--mute)">상품별 상위 2명 · 진행 중 캠페인·독점 확정 상품 제외 · 실행 시 상위 5건 발송</div><button class="pri sm" disabled={!cands.length} onclick={() => act.runAutoPropose()}>오늘 자동 제안 실행 ({Math.min(5, cands.length)}건)</button></div>
	<div class="tblw" style="margin:0;box-shadow:none;padding-top:0"><table>
		<thead><tr><th>브랜드 · 상품</th><th>인플루언서</th><th class="num">성장세</th><th class="num">3개월 매출</th><th class="num">매칭 점수</th></tr></thead>
		<tbody>{#each cands as { b, p, s, growth, score }}<tr><td><b>{p.name}</b> <span class="sub" style="color:var(--mute)">{b.name} · {p.cat}</span></td><td>{@html platIcon(s)} {s.name} {s.handle}{#if s.hidden} <span class="st gray" style="animation:none">비공개</span>{/if} <GradeBox g={gname(s)} /></td><td class="num" style="color:var(--red)">▲{growth.toFixed(1)}%</td><td class="num">₩{fmt(s.m3Sales)}</td><td class="num"><b>{score}</b></td></tr>{:else}<tr><td colspan="5" class="empty">자동 제안 ON 브랜드의 후보가 없습니다</td></tr>{/each}</tbody></table></div>
</div>
<Sec badge={autoCs.length}>자동 제안 이력</Sec>
<div class="listcard">{#each autoCs as c}<CampRow {c} who="brand" />{:else}<div class="empty">아직 자동 제안이 없습니다 — 위에서 실행해보세요</div>{/each}</div>
