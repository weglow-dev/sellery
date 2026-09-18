<script lang="ts">
	/* 매출·순수익 (js/50-admin.js vAdminRevenue) */
	import { D_, prod, seller, calc, celEarned, celBal, fmt, PG_RATE, PLAT_RATE, OPEX_DEF, SAMPLE_CEL_WON, act, go } from '@sellery/core';
	import { Sec, StChip } from '@sellery/ui';
	const cs = $derived(D_().campaigns.filter((c) => ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status) || c.samplePaid));
	const T = $derived((() => { const T = { gross: 0, refund: 0, net: 0, sampleNet: 0, pg: 0, sf: 0, brandPay: 0, pfGross: 0, gBonus: 0, ref: 0, bref: 0, bDisc: 0, costs: 0, pf: 0, vat: 0, pfNet: 0 }; cs.forEach((c) => { const k = calc(c); T.gross += k.gross; T.refund += k.refund; T.net += k.net; T.sampleNet += k.sampleNet || 0; T.pg += k.pg; T.sf += k.sfTotal; T.brandPay += k.brandPay; T.pfGross += k.pfGross; T.gBonus += k.gBonus; T.ref += k.boost + k.refReward; T.bref += k.bBoost + k.bReward; T.bDisc += k.bDisc; T.costs += k.costs; T.pf += k.pf; T.vat += k.vat; T.pfNet += k.pfNet; }); return T; })());
	const led = $derived(D_().celeryLedger || []);
	const topups = $derived(led.filter((e) => e.won)), celWon = $derived(topups.reduce((a, e) => a + (e.won || 0), 0)), celNet = $derived(Math.round(celWon / 1.1));
	const spent = $derived(led.filter((e) => e.delta < 0).reduce((a, e) => a - e.delta, 0));
	const all = $derived([...D_().sellers, ...D_().brands]);
	const earned = $derived(all.reduce((a, x) => a + celEarned(x.id), 0)), granted = $derived(led.filter((e) => e.delta > 0 && !e.won).reduce((a, e) => a + e.delta, 0)), bal = $derived(all.reduce((a, x) => a + celBal(x.id), 0));
	let ox = $state({ ...OPEX_DEF });
	$effect(() => { ox = { ...OPEX_DEF, ...(D_().opex || {}) }; });
	const orders = $derived(D_().orders.length), sellersN = $derived(D_().sellers.length), crawlN = $derived(Object.values(D_().external || {}).flat().length);
	const autoN = $derived(D_().campaigns.filter((c) => c.auto).length);
	const celCover = $derived(D_().campaigns.reduce((a, c) => a + (((c.samplePaid || {}).cel) || 0) * SAMPLE_CEL_WON, 0));
	const varCost = $derived({ celCover, kakao: ox.kakaoPer * orders * 3, claude: ox.claudePerCrawl * sellersN * 30 + ox.claudePerMatch * (autoN + crawlN), pgFixed: ox.pgFixed });
	const fixedTotal = $derived(ox.server + ox.db + ox.cs + ox.domain + ox.misc);
	const varTotal = $derived(varCost.kakao + varCost.claude + varCost.pgFixed + varCost.celCover);
	const opexTotal = $derived(fixedTotal + varTotal), finalNet = $derived(T.pfNet - opexTotal);
	const takeNet = $derived(T.net ? T.pfNet / T.net : 0), bep = $derived(takeNet > 0 ? opexTotal / takeNet : 0);
	const OX_ROWS: [string, string, string][] = [['서버·호스팅 (Vercel Pro)', 'server', ''], ['DB·스토리지·인증 (Supabase Pro)', 'db', ''], ['CS 툴 (채널톡)', 'cs', ''], ['도메인·이메일·모니터링', 'domain', ''], ['기타 SaaS·회계', 'misc', ''], ['PG 월 고정비 (토스 지급대행)', 'pgFixed', ''], ['알림톡 단가 (₩/건)', 'kakaoPer', '주문당 결제·배송·정산 3건'], ['Claude API · 인플루언서 크롤링 분석 (₩/명·일)', 'claudePerCrawl', '외부 판매 감지·반응 지표'], ['Claude API · 자동 매칭/예상 매출 추론 (₩/건)', 'claudePerMatch', '']];
</script>

{#snippet row(l: string, v: string, cls = '', note = '')}<tr class={cls}><td>{@html l}{#if note} <span style="color:var(--mute);font-size:11px">{note}</span>{/if}</td><td class="num">{@html v}</td></tr>{/snippet}

<h2 class="pg">매출·순수익 <small>확정 매출 기준 · PG수수료·보상비용·부가세를 제외한 플랫폼 순수익</small></h2>
<div class="grid g4">
	<div class="card kpi"><div class="lbl">확정 거래액 (GMV)</div><div class="val">₩{fmt(T.net)}</div><div class="sub">결제 ₩{fmt(T.gross)} − 환불 ₩{fmt(T.refund)}</div></div>
	<div class="card kpi"><div class="lbl">플랫폼 수수료 매출</div><div class="val">₩{fmt(T.pf)}</div><div class="sub">{(PLAT_RATE * 100).toFixed(0)}% ₩{fmt(T.pfGross)} − 보상·할인 ₩{fmt(T.costs)}</div></div>
	<div class="card kpi"><div class="lbl">플랫폼 순수익 (VAT 제외)</div><div class="val" style="color:var(--red)">₩{fmt(T.pfNet)}</div><div class="sub">부가세 ₩{fmt(T.vat)} 제외 · 순 테이크레이트 {T.net ? (T.pfNet / T.net * 100).toFixed(2) : '0.00'}%</div></div>
	<div class="card kpi"><div class="lbl">셀러리 충전 매출</div><div class="val">₩{fmt(celWon)}</div><div class="sub">공급가 ₩{fmt(celNet)} · 충전 {topups.length}건 · 소진 {spent}🥬</div></div>
</div>
<div class="grid g2" style="margin-top:18px">
	<div class="card"><h4>손익 요약 — 판매 {cs.length}건</h4>
		<table class="stmt" style="min-width:0;font-size:12.5px"><tbody>
			{@render row('총 결제액', '₩' + fmt(T.gross))}{@render row('환불', '−₩' + fmt(T.refund))}{@render row('<b>확정 매출 (GMV)</b>', '<b>₩' + fmt(T.net) + '</b>')}
			{@render row('　└ 인플루언서 샘플 구매분', '₩' + fmt(T.sampleNet), '', '인플 수수료 0 · 플랫폼 10% 동일')}
			{@render row('PG 수수료 ' + (PG_RATE * 100).toFixed(1) + '%', '−₩' + fmt(T.pg), '', '브랜드 정산에서 차감 · 플랫폼 수익 아님')}
			{@render row('인플루언서 지급', '−₩' + fmt(T.sf), '', '기본 + 등급 보너스 + 추천 부스트')}{@render row('브랜드 정산액', '−₩' + fmt(T.brandPay))}
			{@render row('<b>플랫폼 수수료 총액 ' + (PLAT_RATE * 100).toFixed(0) + '%</b>', '<b>₩' + fmt(T.pfGross) + '</b>')}
			{@render row('　− 인플루언서 등급 보너스', '−₩' + fmt(T.gBonus))}{@render row('　− 인플루언서 추천 보상·부스트', '−₩' + fmt(T.ref))}{@render row('　− 브랜드 추천 보상·할인', '−₩' + fmt(T.bref))}{@render row('　− 브랜드 등급 수수료 할인', '−₩' + fmt(T.bDisc))}
			{@render row('수수료 매출 (VAT 포함)', '₩' + fmt(T.pf))}{@render row('　− 부가세 10%', '−₩' + fmt(T.vat))}
			{@render row('<b>플랫폼 순수익</b>', '<b style="color:var(--red)">₩' + fmt(T.pfNet) + '</b>', 'tot')}
		</tbody></table></div>
	<div class="card"><h4>셀러리 포인트 손익</h4>
		<table class="stmt" style="min-width:0;font-size:12.5px"><tbody>
			{@render row('충전 결제액 (VAT 포함)', '₩' + fmt(celWon))}{@render row('　− 부가세', '−₩' + fmt(celWon - celNet))}{@render row('<b>충전 순매출</b>', '<b>₩' + fmt(celNet) + '</b>', 'tot')}
			{@render row('무상 발행 (가입·이벤트)', granted + ' 🥬')}{@render row('매출 달성 획득 (₩500만당 1)', earned + ' 🥬')}{@render row('소진', spent + ' 🥬')}{@render row('미사용 잔액 (부채)', bal + ' 🥬', '', '충전가 환산 ₩' + fmt(bal * 20000))}
		</tbody></table>
		<p style="font-size:11.5px;color:var(--mute);margin-top:10px">셀러리 1개 = 충전가 ₩20,000 기준. 무상 발행·획득분은 매출이 아닌 마케팅 비용(잔액은 부채)으로 잡습니다.</p></div>
</div>
<Sec note="서버·DB·Claude API·알림톡 등 (월 기준 추정 · 수정 가능)">운영 비용 · 최종 순이익</Sec>
<div class="grid g2">
	<div class="card"><h4>운영 비용 입력 (월)</h4>
		<table class="stmt" style="min-width:0;font-size:12.5px"><tbody>
			{#each OX_ROWS as [l, id, note]}<tr><td>{l}{#if note} <span style="color:var(--mute);font-size:11px">{note}</span>{/if}</td><td class="num"><input type="number" bind:value={ox[id]} step="1000" style="width:110px;text-align:right;padding:4px 8px;font-size:12px" /></td></tr>{/each}
		</tbody></table>
		<div class="btnrow" style="margin-top:12px"><button class="pri sm" onclick={() => act.saveOpex(Object.fromEntries(Object.entries(ox).map(([k, v]) => [k, Math.max(0, +v || 0)])))}>비용 저장 · 재계산</button><button class="sm ghost" onclick={() => act.resetOpex()}>기본값</button></div>
	</div>
	<div class="card"><h4>비용 집계 → 최종 순이익</h4>
		<table class="stmt" style="min-width:0;font-size:12.5px"><tbody>
			{@render row('고정비 합계 (월)', '−₩' + fmt(fixedTotal))}{@render row('　알림톡', '−₩' + fmt(varCost.kakao), '', fmt(orders) + '건 × 3 × ₩' + fmt(ox.kakaoPer))}
			{@render row('　Claude API', '−₩' + fmt(varCost.claude), '', sellersN + '명 × 30일 크롤링 + 추론 ' + (autoN + crawlN) + '건')}{@render row('　PG 고정비', '−₩' + fmt(varCost.pgFixed))}
			{@render row('　샘플 셀러리 결제 보전', '−₩' + fmt(varCost.celCover), '', '인플루언서가 🥬로 낸 샘플값을 브랜드에 원화 지급')}{@render row('<b>운영 비용 합계</b>', '<b>−₩' + fmt(opexTotal) + '</b>')}
			{@render row('플랫폼 순수익 (VAT 제외)', '₩' + fmt(T.pfNet))}
			{@render row('<b>운영비 차감 최종 순이익</b>', '<b style="color:' + (finalNet >= 0 ? 'var(--red)' : 'var(--danger)') + '">' + (finalNet < 0 ? '−' : '') + '₩' + fmt(Math.abs(Math.round(finalNet))) + '</b>', 'tot')}
			{@render row('손익분기 월 GMV', '₩' + fmt(Math.round(bep)), '', '운영비 ÷ 순 테이크레이트 ' + (takeNet * 100).toFixed(2) + '%')}{@render row('운영비율 (운영비 ÷ GMV)', T.net ? (opexTotal / T.net * 100).toFixed(2) + '%' : '—')}
		</tbody></table>
		<p style="font-size:11.5px;color:var(--mute);margin-top:10px">PG 1.9%는 브랜드 정산에서 차감되는 통과 비용이라 위 순수익에 이미 반영(플랫폼 부담 아님). 운영비는 월 단위 추정치이며, 확정 매출은 누적 기준이라 실서비스에서는 월별로 끊어 봅니다.</p></div>
</div>
<Sec>판매별 손익</Sec>
<div class="tblw"><table>
	<thead><tr><th>판매</th><th class="num">확정 매출</th><th class="num">PG</th><th class="num">인플루언서</th><th class="num">브랜드</th><th class="num">수수료 {(PLAT_RATE * 100).toFixed(0)}%</th><th class="num">보상·할인</th><th class="num">VAT</th><th class="num">순수익</th><th>상태</th></tr></thead>
	<tbody>{#each cs as c}{@const k = calc(c)}{@const p = prod(c.productId)}<tr class="clickable" onclick={() => go.camp(c.id)}><td><b>{p.name}</b> <span class="sub" style="color:var(--mute)">{seller(c.sellerId).handle}</span></td><td class="num">₩{fmt(k.net)}</td><td class="num">₩{fmt(k.pg)}</td><td class="num">₩{fmt(k.sfTotal)}</td><td class="num">₩{fmt(k.brandPay)}</td><td class="num">₩{fmt(k.pfGross)}</td><td class="num">−₩{fmt(k.costs)}</td><td class="num">−₩{fmt(k.vat)}</td><td class="num"><b>₩{fmt(k.pfNet)}</b></td><td><StChip st={c.status} /></td></tr>{:else}<tr><td colspan="10" class="empty">확정 매출이 있는 판매가 없습니다</td></tr>{/each}</tbody>
</table></div>
