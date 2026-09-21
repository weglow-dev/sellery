<script lang="ts">
	import { S, D_, brand, camp, prod, seller, myProductIds, fmt, md, P, act, openModal } from '@sellery/core';
	import { PIcon } from '@sellery/ui';
	const myP = $derived(myProductIds(S.actingBrand));
	const cids = $derived(D_().campaigns.filter((c) => myP.includes(c.productId)).map((c) => c.id));
	const os = $derived(D_().orders.filter((o) => cids.includes(o.campaignId)).slice(-40).reverse());
	const po = $derived(D_().autoPO || { on: false, email: 'orders@' + brand(S.actingBrand).name + '.co' });
	const unshipped = $derived(D_().orders.filter((o) => cids.includes(o.campaignId) && o.status === 'PAID' && !o.tracking).length);
	let email = $state('');
	$effect(() => { email = po.email; });
	function pickCSV(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => act.applyTrackCSV(String(rd.result)); rd.readAsText(f); (e.target as HTMLInputElement).value = ''; }
</script>

<h2 class="pg">주문·발주 <small>발주서 다운로드 → 송장 채워서 일괄 업로드</small></h2>
<div class="grid g3" style="margin-bottom:16px">
	<div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">발주서 내보내기</h4><p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">현재 주문을 엑셀(CSV)로 다운로드하거나, 물류팀 이메일로 바로 발송합니다.</p><div class="btnrow"><button class="pri sm" onclick={() => act.poCSV()}>⬇ 발주서 CSV</button><button class="sm" onclick={() => act.poEmail(email)}>✉ 이메일 발송 (시뮬)</button></div></div>
	<div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">송장 일괄 업로드 {#if unshipped}<span class="st amber">미발송 {unshipped}건</span>{:else}<span class="st green">모두 발송됨</span>{/if}</h4><p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">양식(주문번호,운송장번호)을 채워 업로드하면 자동 매칭되어 배송중 처리됩니다. 구매자 배송 알림은 실서비스에서 자동 발송.</p><div class="btnrow"><label class="pri sm" style="cursor:pointer"><input type="file" accept=".csv,.txt" hidden onchange={pickCSV} /><span>⬆ 송장 CSV 업로드</span></label><button class="sm ghost" onclick={() => act.trackCSVTemplate()}>양식 다운로드</button></div></div>
	<div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">자동 발주 {#if po.on}<span class="st green">ON</span>{:else}<span class="st gray">OFF</span>{/if}</h4><p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">매일 09:00 신규 주문 발주서를 자동 발송하고, 판매 종료 시 최종 발주서를 보냅니다.</p><div class="autopo"><input bind:value={email} style="max-width:240px" placeholder="물류팀 이메일" /><button class="sm {po.on ? 'danger' : 'pri'}" onclick={() => act.saveAutoPO(email)}>{po.on ? '자동 발주 끄기' : '자동 발주 켜기'}</button></div></div>
</div>
<div class="tblw"><table>
	<thead><tr><th>주문번호</th><th>구매자</th><th>판매</th><th class="num">수량</th><th class="num">금액</th><th>일자</th><th>운송장</th><th>상태</th><th></th></tr></thead>
	<tbody>
		{#each os as o}
			{@const c = camp(o.campaignId)!}{@const p = prod(c.productId)}
			<tr><td class="num">{o.id.toUpperCase()}</td><td>{o.buyer}</td><td><PIcon {p} sz={22} /> {p.name} <span style="color:var(--mute);font-size:11px">{seller(c.sellerId).handle}</span></td>
				<td class="num">{o.qty}</td><td class="num">₩{fmt(o.unit * o.qty)}</td><td class="num">{md(P(o.at))}</td>
				<td>{#if o.tracking}<span class="num" style="font-size:11px">{o.tracking}</span>{:else if o.status === 'PAID'}<button class="sm ghost" onclick={() => openModal('trackOne', { oid: o.id })}>송장 입력</button>{:else}—{/if}</td>
				<td>{#if o.status !== 'PAID'}<span class="st red">환불</span>{:else if o.tracking}<span class="st blue">배송중</span>{:else}<span class="st green">결제완료</span>{/if}</td>
				<td>{#if o.status === 'PAID' && c.status !== 'SETTLED'}<button class="sm ghost" onclick={() => act.refund(o.id)}>환불 처리</button>{/if}</td></tr>
		{:else}
			<tr><td colspan="9" class="empty">주문이 없습니다</td></tr>
		{/each}
	</tbody></table></div>
