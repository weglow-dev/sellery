<script lang="ts">
	import { S, camp, prod, seller, csOf, md, P, act, openModal } from '@sellery/core';
	import { PIcon } from '@sellery/ui';
	const all = $derived(csOf(S.actingBrand).slice().sort((a, b) => (a.status === 'OPEN' ? -1 : 1) - (b.status === 'OPEN' ? -1 : 1) || (a.at < b.at ? 1 : -1)));
	const open = $derived(all.filter((x) => x.status === 'OPEN').length);
	const M: Record<string, [string, string]> = { OPEN: ['답변 대기', 'amber'], ANSWERED: ['답변 완료', 'green'], CLOSED: ['처리 종료', 'gray'] };
</script>

<h2 class="pg">고객 문의 <small>구매 고객이 남긴 문의가 바로 여기로 옵니다 — 답변하면 고객에게 알림톡으로 전달됩니다</small></h2>
<div class="flex gap-2.5 items-center flex-wrap" style="margin-bottom:14px"><span class="st {open ? 'amber' : 'gray'}" style="animation:none">답변 대기 {open}건</span><span class="st gray" style="animation:none">전체 {all.length}건</span><span style="color:var(--mute);font-size:12px">배송·교환·반품은 브랜드가 직접, 결제·정산 문제는 셀러리 운영팀이 함께 처리합니다</span></div>
<div class="listcard">
	{#each all as x}
		{@const c = camp(x.cid)}{@const p = c && prod(c.productId)}{@const sl = c && seller(c.sellerId)}{@const m = M[x.status] || [x.status, 'gray']}
		<div class="rowitem" style="cursor:default;align-items:flex-start">
			{#if p}<PIcon {p} sz={38} />{/if}
			<div class="grow">
				<div class="nm">{p ? p.name : '—'} <span class="chip">{x.type}</span> <span class="st {m[1]}" style="animation:none">{m[0]}</span></div>
				<div class="sub">주문 {x.orderId ? x.orderId.toUpperCase() : '—'} · 구매자 {x.buyer || '고객'} · {sl ? sl.handle : ''} · {md(P(x.at))}</div>
				<div style="margin-top:7px;font-size:13px;color:var(--ink);background:var(--surface-2);border:1.5px solid var(--soft-line);padding:9px 11px">{x.msg}</div>
				{#if x.reply}<div style="margin-top:6px;font-size:12.5px;color:var(--mute)"><b style="color:var(--ink)">답변</b> · {md(P(x.repliedAt!))}<br />{x.reply}</div>{/if}
			</div>
			<div class="rowacts">
				{#if x.status === 'OPEN'}<button class="pri sm" onclick={() => openModal('csReply', { id: x.id })}>답변하기</button>{:else}<button class="sm ghost" onclick={() => openModal('csReply', { id: x.id })}>답변 수정</button>{/if}
				{#if x.status !== 'CLOSED'}<button class="sm ghost" onclick={() => act.csClose(x.id)}>처리 종료</button>{/if}
			</div>
		</div>
	{:else}
		<div class="empty">접수된 고객 문의가 없습니다</div>
	{/each}
</div>
