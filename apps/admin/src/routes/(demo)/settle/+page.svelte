<script lang="ts">
	import { D_, prod, seller, brand, calc, sellerWht, settleDue, fmt, md, P, today, DAY, CLEAR_DAYS, act } from '@sellery/core';
	import { Sec, PIcon } from '@sellery/ui';
	const ready = $derived(D_().campaigns.filter((c) => c.status === 'CLEARING'));
	const dueList = $derived(ready.filter((c) => settleDue(c) <= today()));
</script>

<h2 class="pg">정산 실행 <small>판매 종료 + {CLEAR_DAYS}일 경과 건 일괄 지급</small></h2>
<div class="flex gap-2.5 items-center flex-wrap" style="margin-bottom:12px"><span class="st {dueList.length ? 'amber' : 'gray'}" style="animation:none">실행 가능 {dueList.length}건</span><span class="st gray" style="animation:none">대기 {ready.length - dueList.length}건</span><button class="pri sm" disabled={!dueList.length} onclick={() => act.runSettleAll()}>실행 가능 건 일괄 정산 ({dueList.length})</button></div>
<div class="listcard">
	{#each ready as c}{@const k = calc(c)}{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}{@const due = settleDue(c)}{@const isDue = due <= today()}{@const hold = !sl.settleInfo?.account || !brand(p.brandId).settleInfo?.account}
		<div class="rowitem">
			<PIcon {p} sz={38} />
			<div class="grow"><div class="nm">{p.name} · {sl.handle}</div>
				<div class="sub">확정 ₩{fmt(k.net)} → 브랜드 ₩{fmt(k.brandPay)} + 인플루언서 ₩{fmt(k.sfTotal * (1 - sellerWht(sl)))} · 정산 기준일 {md(due)}{#if hold} · <span class="st red" style="animation:none">정산 정보 미등록 → 지급 보류</span>{/if}</div></div>
			{#if isDue}<button class="sm pri" onclick={() => act.runSettle(c.id)}>정산 실행</button>{:else}<span class="st amber">D-{Math.ceil((due.getTime() - today().getTime()) / DAY)}</span> <button class="sm ghost" onclick={() => act.ffwd(c.id)}>⏩ 3주 경과(시뮬)</button>{/if}
		</div>
	{:else}<div class="empty">정산 대기 건이 없습니다</div>{/each}
</div>
<Sec>정산 완료</Sec>
<div class="tblw"><table><thead><tr><th>일자</th><th>판매</th><th class="num">확정 매출</th><th class="num">브랜드 지급</th><th class="num">인플루언서 지급</th><th class="num">플랫폼 수익</th></tr></thead>
	<tbody>{#each D_().settlements as s}<tr><td class="num">{md(P(s.at))}</td><td>{s.title}{#if s.holdS || s.holdB} <span class="st red" style="animation:none">지급 보류 · {[s.holdS ? '인플' : '', s.holdB ? '브랜드' : ''].filter(Boolean).join('·')} 계좌 미등록</span>{/if}</td><td class="num">₩{fmt(s.net)}</td><td class="num">₩{fmt(s.brandPay)}</td><td class="num">₩{fmt(s.sellerPay)}</td><td class="num" style="color:var(--red)">₩{fmt(s.platFee)}</td></tr>{:else}<tr><td colspan="6" class="empty">아직 없음</td></tr>{/each}</tbody>
</table></div>
