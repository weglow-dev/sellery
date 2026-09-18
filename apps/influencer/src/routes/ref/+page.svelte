<script lang="ts">
	import { S, D_, seller, fmt, REF_TIMES, DONE_STATES, act } from '@sellery/core';
	import { Sec } from '@sellery/ui';
	const me = $derived(seller(S.actingSeller));
	const myRefs = $derived(D_().sellers.filter((s) => s.referredBy === S.actingSeller));
	const earns = $derived((D_().refEarnings || []).filter((e) => e.referrerId === S.actingSeller));
	const total = $derived(earns.reduce((a, e) => a + e.amt, 0));
	const usedOf = (sid: string) => D_().campaigns.filter((x) => x.sellerId === sid && DONE_STATES.includes(x.status)).length;
</script>

<h2 class="pg">추천 프로그램 <small>인플루언서가 인플루언서를 데려오면 둘 다 이득 — 전액 셀러리 부담</small></h2>
{#if me.referredBy}<div class="card" style="border-color:var(--red);margin-bottom:18px"><b>🌱 추천 부스트 적용 중</b> — {seller(me.referredBy).name}님 추천으로 가입했어요. 첫 {REF_TIMES}회 판매 수수료 <b>+1%p</b> (남은 횟수 {Math.max(0, REF_TIMES - usedOf(me.id))}회). 기본 수수료율은 그대로 — 보상은 셀러리가 부담합니다.</div>{/if}
<div class="grid g2">
	<div class="card"><div class="lbl-sm">내 추천 코드</div>
		<div class="flex items-center gap-3.5 flex-wrap" style="margin:12px 0"><span class="font-display" style="font-size:30px;font-weight:800;letter-spacing:.12em;background:var(--yellow);box-shadow:var(--pxb2);padding:4px 18px">{me.refCode}</span><button class="sm" onclick={() => act.copyRef(me.refCode)}>코드 복사</button></div>
		<p style="font-size:12.5px;color:var(--mute);margin:0">동료 인플루언서가 가입할 때 이 코드를 입력하면 보상이 시작됩니다.</p></div>
	<div class="card"><div class="lbl-sm">보상 구조</div>
		<ul style="font-size:13px;margin:10px 0 0;padding-left:18px;line-height:2.1"><li><b>나 (추천인)</b> — 새 인플루언서의 첫 {REF_TIMES}회 판매, <b>확정 매출의 2%</b> 지급</li><li><b>새 인플루언서</b> — 첫 {REF_TIMES}회 판매, 수수료 <b>+1%p</b></li><li>새 인플루언서의 수수료율은 <b>절대 깎이지 않음</b> — 보상은 플랫폼 수수료에서 지급</li></ul></div>
</div>
<div class="grid g2" style="margin-top:18px">
	<div class="card kpi"><div class="lbl">누적 추천 수익</div><div class="val" style="color:var(--money)">₩{fmt(total)}</div><div class="sub">정산 완료 기준 · 진행 중 판매는 정산 시 지급</div></div>
	<div class="card kpi"><div class="lbl">내가 추천한 인플루언서</div><div class="val">{myRefs.length}명</div><div class="sub">인플루언서당 최대 {REF_TIMES}회 판매까지 보상</div></div>
</div>
<Sec>추천 현황</Sec>
<div class="tblw"><table>
	<thead><tr><th>인플루언서</th><th class="num">보상 판매 진행</th><th class="num">발생 수익</th></tr></thead>
	<tbody>{#each myRefs as s}<tr><td><b>{s.name}</b> {s.handle}</td><td class="num">{Math.min(usedOf(s.id), REF_TIMES)} / {REF_TIMES}회</td><td class="num">₩{fmt(earns.filter((x) => x.fromSellerId === s.id).reduce((a, x) => a + x.amt, 0))}</td></tr>{:else}<tr><td colspan="3" class="empty">아직 추천한 인플루언서가 없습니다 — 코드를 공유해보세요</td></tr>{/each}</tbody>
</table></div>
