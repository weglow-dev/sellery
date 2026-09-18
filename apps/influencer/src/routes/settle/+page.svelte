<script lang="ts">
	import { S, D_, seller, prod, calc, settleDue, fmt, md, P, WHT, act, go } from '@sellery/core';
	import { PIcon, StChip } from '@sellery/ui';
	const mine = $derived(D_().campaigns.filter((c) => c.sellerId === S.actingSeller && ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status)));
	const si = $derived(seller(S.actingSeller).settleInfo || {});
	const noAcct = $derived(!(si.bank && si.account));
</script>

<h2 class="pg">정산 <small>수수료 = 확정 매출 × 수수료율, 개인 인플루언서 원천징수 3.3%</small></h2>
{#if noAcct}<div class="card flex gap-3.5 items-center flex-wrap" style="border-color:var(--danger);margin-bottom:14px"><b style="color:var(--danger)">⚠ 정산 계좌 미등록</b><span style="font-size:13px;color:var(--mute)">계좌를 등록해야 D+21 지급이 실행됩니다.</span><button class="pri sm" onclick={() => go.screen('my')}>마이페이지에서 등록</button></div>{/if}
<div style="margin-bottom:14px"><button class="sm ghost" onclick={() => act.settleCSV()}>⬇ 명세 CSV 다운로드</button></div>
<div class="tblw"><table>
	<thead><tr><th>판매</th><th>기간</th><th class="num">확정 매출</th><th class="num">수수료율</th><th class="num">수수료(세전)</th><th class="num">실수령(예정)</th><th>상태</th><th>지급 예정일</th></tr></thead>
	<tbody>
		{#each mine as c}
			{@const k = calc(c)}{@const p = prod(c.productId)}
			<tr class="clickable" onclick={() => go.camp(c.id)}><td><b><PIcon {p} sz={20} /> {p.name}</b></td><td class="num">{md(P(c.start!))}–{md(P(c.end!))}</td><td class="num">₩{fmt(k.net)}</td><td class="num">{(p.rate * 100).toFixed(0)}%{#if k.rb} <b style="color:var(--red)">+1%p</b>{/if}</td><td class="num">₩{fmt(k.sfTotal)}</td><td class="num" style="color:var(--money);font-weight:700">₩{fmt(k.sfTotal * (1 - WHT))}</td><td><StChip st={c.status} /></td><td class="num">{c.status === 'SETTLED' ? '지급완료' : md(settleDue(c))}</td></tr>
		{:else}
			<tr><td colspan="8" class="empty">정산 내역이 없습니다</td></tr>
		{/each}
	</tbody></table></div>
