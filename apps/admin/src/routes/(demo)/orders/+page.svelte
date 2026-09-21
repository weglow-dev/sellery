<script lang="ts">
	import { S, D_, camp, prod, seller, brand, csList, platIcon, fmt, md, P, act, go } from '@sellery/core';
	import { Sec, PIcon, Chips } from '@sellery/ui';
	const os = $derived(D_().orders.slice().sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : +b.id.slice(1) - +a.id.slice(1))));
	const f = $derived(S.ui.admOF || 'all');
	const list = $derived(os.filter((o) => f === 'all' || (f === 'PAID' && o.status === 'PAID' && !o.tracking) || (f === 'SHIP' && o.status === 'PAID' && o.tracking) || (f === 'REFUNDED' && o.status === 'REFUNDED')).slice(0, 60));
	const c = (k: string) => os.filter((o) => (k === 'PAID' ? o.status === 'PAID' && !o.tracking : k === 'SHIP' ? o.status === 'PAID' && o.tracking : o.status === 'REFUNDED')).length;
	const all = $derived(csList().slice().sort((a, b) => (a.status === 'OPEN' ? -1 : 1) - (b.status === 'OPEN' ? -1 : 1) || (a.at < b.at ? 1 : -1)));
	const open = $derived(all.filter((x) => x.status === 'OPEN').length);
	const M: Record<string, [string, string]> = { OPEN: ['답변 대기', 'amber'], ANSWERED: ['답변 완료', 'green'], CLOSED: ['처리 종료', 'gray'] };
</script>

<h2 class="pg">주문·CS <small>전체 주문 {fmt(os.length)}건 · 환불 처리·배송 상태 확인 (최근 60건 표시)</small></h2>
<Chips list={[['all', '전체', os.length], ['PAID', '결제완료·미발송', c('PAID')], ['SHIP', '배송중', c('SHIP')], ['REFUNDED', '환불', c('REFUNDED')]]} cur={f} onpick={(k) => (S.ui.admOF = k)} />
<div class="tblw compact"><table>
	<thead><tr><th>주문</th><th>상품 · 옵션</th><th>판매</th><th class="num">금액</th><th>배송</th><th>상태</th><th>관리</th></tr></thead>
	<tbody>
		{#each list as o}{@const cp = camp(o.campaignId)!}{@const p = prod(cp.productId)}{@const sl = seller(cp.sellerId)}{@const b = brand(p.brandId)}
			<tr><td class="nm"><b>{o.id.toUpperCase()}</b><div style="font-size:11.5px;color:var(--mute)">{md(P(o.at))} · {o.buyer}</div></td>
				<td><PIcon {p} sz={22} /> {p.name}<div style="font-size:11.5px;color:var(--mute)">{o.opt ? o.opt + ' · ' : ''}{o.qty}개</div></td>
				<td style="white-space:nowrap">{@html platIcon(sl)} {sl.name}<div style="font-size:11.5px;color:var(--mute)">{b.name} · {cp.id.toUpperCase()}</div></td>
				<td class="num"><b>₩{fmt(o.unit * o.qty)}</b></td>
				<td>{#if o.tracking}<span class="st blue" style="animation:none">배송중</span><div style="font-size:11px;color:var(--mute)">{o.courier || ''} {o.tracking}</div>{:else if o.status === 'PAID'}<span class="st amber" style="animation:none">미발송</span>{:else}—{/if}</td>
				<td>{#if o.status === 'PAID'}<span class="st green" style="animation:none">결제완료</span>{:else}<span class="st red" style="animation:none">환불</span>{/if}</td>
				<td><div class="flex gap-1 flex-wrap"><button class="sm ghost" onclick={() => go.camp(cp.id)}>스레드</button>{#if o.status === 'PAID' && cp.status !== 'SETTLED'}<button class="sm danger" onclick={() => act.refund(o.id)}>환불 처리</button>{:else if o.status === 'PAID'}<span class="sub" style="color:var(--mute);font-size:11px">정산 완료 · 환불 불가</span>{/if}</div></td></tr>
		{:else}<tr><td colspan="7" class="empty">주문이 없습니다</td></tr>{/each}
	</tbody></table></div>
<Sec badge={open} note="— 문의는 브랜드에 바로 배정되며, 관리자는 처리 현황을 확인합니다">고객 문의</Sec>
<div class="tblw"><table>
	<thead><tr><th>접수</th><th>상품 · 판매</th><th>브랜드</th><th>유형</th><th>내용</th><th>상태</th></tr></thead>
	<tbody>
		{#each all as x}{@const cc = camp(x.cid)}{@const p = cc && prod(cc.productId)}{@const b = p && brand(p.brandId)}{@const m = M[x.status] || [x.status, 'gray']}
			<tr class="clickable" onclick={() => go.camp(x.cid)}><td class="num">{md(P(x.at))}<div style="font-size:11px;color:var(--mute)">{x.orderId ? x.orderId.toUpperCase() : '—'}</div></td><td>{#if p}<PIcon {p} sz={22} /> {p.name}{:else}—{/if}<div style="font-size:11px;color:var(--mute)">{cc ? seller(cc.sellerId).handle : ''}</div></td><td class="brd-cell">{b ? b.name : '—'}</td><td>{x.type}</td><td style="max-width:280px">{x.msg.slice(0, 42)}{x.msg.length > 42 ? '…' : ''}</td><td><span class="st {m[1]}" style="animation:none">{m[0]}</span></td></tr>
		{:else}<tr><td colspan="6" class="empty">접수된 고객 문의가 없습니다</td></tr>{/each}
	</tbody></table></div>
