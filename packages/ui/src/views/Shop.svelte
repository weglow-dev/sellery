<script lang="ts">
	/* 셀러리 샵 (js/30-shared.js vShop) */
	import { S, D_, brand, seller, bGmv, celBal, celEarned, passActive, sampleLeft, fmt, md, P, today, DAY, CEL, CELERY_PER, SHOP, TOPUP, act } from '@sellery/core';
	import Sec from '../components/Sec.svelte';
	const isBrand = $derived(S.role === 'brand');
	const who = $derived(isBrand ? S.actingBrand : S.actingSeller);
	const ent = $derived(isBrand ? brand(who) : seller(who));
	const bal = $derived(celBal(who)), earned = $derived(celEarned(who));
	const gmv = $derived(isBrand ? bGmv(brand(who)) : seller(who).m3Sales);
	const toNext = $derived(CELERY_PER - (gmv % CELERY_PER));
	const items = $derived(SHOP[isBrand ? 'brand' : 'seller']);
	const ledger = $derived((D_().celeryLedger || []).filter((e) => e.who === who).slice().reverse().slice(0, 8));
	const owned = $derived(ent.celeryItems || {});
</script>

<h2 class="pg">셀러리 샵 <small>판매로 모은 셀러리로 프리미엄 기능을 사용하세요 · 1 {@html CEL} ≈ ₩20,000 가치</small></h2>
<div class="grid g3">
	<div class="card kpi"><div class="lbl">내 셀러리</div><div class="val flex items-center gap-2">{@html CEL} {bal}</div><div class="sub">획득 {earned} + 이벤트/충전 − 사용</div></div>
	<div class="card kpi"><div class="lbl">획득 규칙</div><div class="val flex items-center gap-1.5" style="font-size:20px">₩500만 = 1 {@html CEL}</div><div class="sub">확정 매출 기준 · 다음 1개까지 ₩{fmt(toNext)}</div></div>
	<div class="card"><div class="lbl-sm">충전 (시뮬 결제)</div>
		<div class="btnrow" style="margin-top:10px">{#each TOPUP as t}<button class="sm" onclick={() => act.topup(t.n)}>{@html CEL} {t.n} · ₩{fmt(t.won)}</button>{/each}</div>
		<p style="font-size:11.5px;color:var(--mute);margin:10px 0 0">충전 셀러리는 환불 불가 · 획득 셀러리와 합산 사용</p></div>
</div>
<Sec note="— {isBrand ? '브랜드 센터' : '인플루언서 센터'}에서만 구매·사용">{isBrand ? '브랜드 전용 아이템' : '인플루언서 전용 아이템'}</Sec>
<div class="grid g2">
	{#each items as it}
		<div class="card shop-item">
			<div class="flex justify-between items-start gap-2.5">
				<div><div style="font-weight:800;font-size:15px">{it.name}</div><div style="font-size:12.5px;color:var(--mute);margin-top:4px">{it.desc}</div></div>
				<span class="celprice">{@html CEL} {it.price}</span>
			</div>
			<div class="btnrow" style="margin-top:12px">
				{#if it.auto}<span class="st gray" style="animation:none">사용 시 자동 차감</span>
				{:else if owned[it.id] && !it.repeat && passActive(ent, it.id, it.days)}<span class="st green">보유 중{it.days ? ` · ${Math.max(0, it.days - Math.floor((today().getTime() - P(owned[it.id]).getTime()) / DAY))}일 남음` : (it.id === 'featured' || it.id === 'boost' ? ' · 활성' : '')}</span>
				{:else}<button class="pri sm" onclick={() => act.buyItem(it.id)}>{@html CEL} {it.price} 로 구매</button>{/if}
			</div>
		</div>
	{/each}
</div>
<Sec>셀러리 내역</Sec>
<div class="tblw"><table>
	<thead><tr><th>일자</th><th>내용</th><th class="num">변동</th></tr></thead>
	<tbody>{#each ledger as e}<tr><td class="num">{md(P(e.at))}</td><td>{e.memo}</td><td class="num" style="color:{e.delta > 0 ? 'var(--red)' : 'var(--danger)'};font-weight:700">{e.delta > 0 ? '+' : ''}{e.delta} {@html CEL}</td></tr>{:else}<tr><td colspan="3" class="empty">내역이 없습니다</td></tr>{/each}</tbody>
</table></div>
