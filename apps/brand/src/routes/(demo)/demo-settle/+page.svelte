<script lang="ts">
	import { S, D_, brand, prod, seller, calc, settleDue, myProductIds, fmt, md, PG_RATE, PLAT_RATE, CLEAR_DAYS, act, go } from '@sellery/core';
	import { PIcon, StChip } from '@sellery/ui';
	const myP = $derived(myProductIds(S.actingBrand));
	const cs = $derived(D_().campaigns.filter((c) => myP.includes(c.productId) && (['LIVE', 'CLEARING', 'SETTLED'].includes(c.status) || c.samplePaid)));
	const bsi = $derived(brand(S.actingBrand).settleInfo || {});
	const bNoAcct = $derived(!(bsi.bank && bsi.account && bsi.bizNo));
</script>

<h2 class="pg">정산 <small>확정 매출 − PG {(PG_RATE * 100).toFixed(1)}% − 인플루언서 수수료 − 플랫폼 {(PLAT_RATE * 100).toFixed(0)}%</small></h2>
{#if bNoAcct}<div class="card flex gap-3.5 items-center flex-wrap" style="border-color:var(--danger);margin-bottom:14px"><b style="color:var(--danger)">⚠ 정산 정보 미등록</b><span style="font-size:13px;color:var(--mute)">사업자등록번호·정산 계좌를 등록해야 D+{CLEAR_DAYS} 지급과 세금계산서 발행이 실행됩니다.</span><button class="pri sm" onclick={() => go.screen('my')}>마이페이지에서 등록</button></div>{/if}
<div style="margin-bottom:14px"><button class="sm ghost" onclick={() => act.settleCSV()}>⬇ 명세 CSV 다운로드</button></div>
<div class="tblw"><table>
	<thead><tr><th>판매</th><th>인플루언서</th><th class="num">확정 매출</th><th class="num">인플루언서 수수료</th><th class="num">플랫폼+PG</th><th class="num">브랜드 정산액</th><th>상태</th><th>정산일</th></tr></thead>
	<tbody>
		{#each cs as c}{@const k = calc(c)}{@const p = prod(c.productId)}
			<tr class="clickable" onclick={() => go.camp(c.id)}><td><b><PIcon {p} sz={20} /> {p.name}</b></td><td>{seller(c.sellerId).handle}</td><td class="num">₩{fmt(k.net)}</td><td class="num">−₩{fmt(k.sf)}</td><td class="num">−₩{fmt(k.pf + k.pg)}</td><td class="num" style="font-weight:700">₩{fmt(k.brandPay)}</td><td><StChip st={c.status} /></td><td class="num">{c.status === 'SETTLED' ? '완료' : c.end ? md(settleDue(c)) : '—'}</td></tr>
		{:else}<tr><td colspan="8" class="empty">내역 없음</td></tr>{/each}
	</tbody></table></div>
