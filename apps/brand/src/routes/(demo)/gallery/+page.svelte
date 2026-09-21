<script lang="ts">
	import { S, D_, brand, gname, tierIdx, gfull, dataPrice, passActive, platIcon, fmt, CEL, GICON, PLAT_ICONS, CATMAP, act, openModal, type Seller } from '@sellery/core';
	import { Sec, SellerCard } from '@sellery/ui';
	const unlocked = $derived(D_().unlockedRefs || []);
	const b = $derived(brand(S.actingBrand));
	const gf = $derived(S.ui.galGrade || '전체'), pfilt = $derived(S.ui.galPlat || 'all');
	const pass = (s: Seller) => (pfilt === 'all' || s.platform === pfilt) && (gf === '전체' || (tierIdx(gname(s)) > -1 && tierIdx(gname(s)) <= tierIdx(gf)));
	const rel = $derived(CATMAP[b.cat] || []);
	const pub = $derived(D_().sellers.filter((s) => !s.hidden));
	const recs = $derived(pub.map((s) => ({ s, catFit: rel.includes(s.cat), score: (rel.includes(s.cat) ? 2 : 0) + (s.m3Sales / s.followers) / 300 + (passActive(s, 'featured', 7) ? 5 : 0) })).sort((a, b) => b.score - a.score).slice(0, 2));
	const scout = $derived(D_().sellers.filter((s) => s.hidden && pass(s)));
	const filtered = $derived(pub.filter(pass));
	const PLATS: [string, string][] = [['all', '전체'], ['instagram', '인스타그램'], ['youtube', '유튜브'], ['tiktok', '틱톡'], ['naver', '네이버 블로그']];
</script>

<h2 class="pg">인플루언서 갤러리 <small>건강·웰니스 판매 레퍼런스가 인증된 인플루언서 · 이력·반응 데이터를 보고 직접 제안하세요</small></h2>
<div class="card" style="margin-bottom:20px">
	<div class="flex gap-2 items-center flex-wrap" style="margin-bottom:8px"><span class="lbl-sm" style="min-width:64px">등급</span><div class="cats" style="margin:0">{#each ['전체', '실버', '골드', '플래티넘', '다이아'] as g}<button class="catchip {gf === g ? 'on' : ''}" onclick={() => (S.ui.galGrade = g)}>{#if g === '전체'}전체{:else}{@html (GICON as Record<string, string>)[g] || ''} {g} 이상{/if}</button>{/each}</div></div>
	<div class="flex gap-2 items-center flex-wrap"><span class="lbl-sm" style="min-width:64px">메인 SNS</span><div class="cats" style="margin:0">{#each PLATS as [k, l]}<button class="catchip {pfilt === k ? 'on' : ''}" onclick={() => (S.ui.galPlat = k)}>{#if k !== 'all'}{@html PLAT_ICONS[k]} {/if}{l}</button>{/each}</div></div>
</div>
<Sec style="margin-top:0">{b.name} 맞춤 추천 인플루언서</Sec>
<div class="grid g2">{#each recs as r}<SellerCard s={r.s} reason="{r.catFit ? `${b.cat}와 카테고리 적합` : '매출 효율 상위'} · 매출/팔로워 ₩{fmt(r.s.m3Sales / r.s.followers)}" />{/each}</div>
<Sec note="{filtered.length}명">전체 인플루언서</Sec>
<div class="grid g2">{#each filtered as s}<SellerCard {s} />{:else}<div class="empty card" style="grid-column:1/-1">조건에 맞는 인플루언서가 없습니다 — 필터를 넓혀보세요</div>{/each}</div>
<Sec>익명 인플루언서 스카우트 — 유료 레퍼런스</Sec>
<p style="font-size:12.5px;color:var(--mute);margin:-2px 0 14px">프로필 비공개 인플루언서입니다. 레퍼런스 열람권(건당)을 구매하면 상세 지표를 확인하고 제안을 보낼 수 있습니다. <b>제안이 수락되는 순간 DM이 열리고 신원이 공개됩니다.</b></p>
<div class="grid g2">
	{#each scout as s}{@const un = unlocked.includes(s.id)}
		<div class="card">
			<div class="flex gap-2.5 items-center flex-wrap"><span class="gradebox">{@html gfull(gname(s))}</span>{@html platIcon(s)}<b>○○○ 인플루언서</b><span style="color:var(--mute);font-size:12px">{s.cat} 주력</span></div>
			<div class="font-display" style="font-size:23px;font-weight:800;margin:8px 0 3px">₩{fmt(s.m3Sales)} <span style="font-size:11px;color:var(--mute);font-weight:500">최근 3개월 매출</span></div>
			{#if un}<div style="font-size:12.5px;color:var(--mute)">팔로워 {fmt(s.followers)} · 좋아요 평균 {fmt(s.likesAvg)} · 참여율 {(s.likesAvg / s.followers * 100).toFixed(1)}% · 매출/팔로워 ₩{fmt(s.m3Sales / s.followers)}</div><div class="btnrow" style="margin-top:12px"><button class="pri sm" onclick={() => openModal('invite', { sid: s.id })}>판매 제안 보내기</button></div>
			{:else}<div style="font-size:12.5px;color:var(--mute)">팔로워 ●●●,●●● · 좋아요 평균 ●,●●● — 상세 지표 잠김</div><div class="btnrow" style="margin-top:12px"><button class="sm" onclick={() => act.unlockRef(s.id)}>🔓 레퍼런스 열람 · {@html CEL} {dataPrice(s)}</button></div>{/if}
		</div>
	{/each}
</div>
<p style="font-size:12px;color:var(--mute);margin-top:12px">※ 제안은 인플루언서가 수락해야 진행됩니다(수락 대기 → 샘플 발송). 거절 시 제안권은 브랜드에 환급됩니다.</p>
