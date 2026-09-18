<script lang="ts">
	import { S, camp, prod, brand, custOrders, settleDue, fmt, md, P, KAKAO_ICON, act, openModal, go } from '@sellery/core';
	import { PIcon } from '@sellery/ui';
	const os = $derived(custOrders());
	const ST_O: Record<string, [string, string]> = { PAID: ['결제 완료', 'green'], REFUNDED: ['환불 완료', 'gray'] };
</script>

{#if !S.cust}
	<h2 class="pg">내 주문</h2>
	<div class="card" style="text-align:center;padding:34px"><b>카카오 로그인</b>하면 주문·배송·환불을 한곳에서 볼 수 있어요<div class="btnrow" style="justify-content:center;margin-top:14px"><button class="sm kakao" onclick={() => act.kakaoStart('')}>{@html KAKAO_ICON} 카카오 로그인</button></div></div>
{:else}
	<h2 class="pg">내 주문 <small>{S.cust.name}님 · {os.length}건</small></h2>
	{#if os.length}
		<div class="listcard">
			{#each os as o}{@const c = camp(o.campaignId)!}{@const p = prod(c.productId)}{@const b = brand(p.brandId)}{@const st = ST_O[o.status] || [o.status, 'gray']}
				{@const ship = o.status !== 'PAID' ? '' : c.status === 'LIVE' ? '브랜드 발송 준비 중' : c.status === 'CLEARING' ? `교환·환불 ${md(settleDue(c))}까지` : '배송 완료'}
				<div class="rowitem cart-row"><PIcon {p} sz={44} /><div class="grow" style="min-width:160px"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {o.opt || ''} × {o.qty}</span></div><div class="sub">{o.id.toUpperCase()} · {md(P(o.at))} 주문 · {b.name} 직배송{ship ? ' · ' + ship : ''}</div></div>
					<span class="st {st[1]}" style="animation:none">{st[0]}</span><div class="cart-sum">₩{fmt(o.unit * o.qty)}</div>
					<div class="btnrow" style="margin:0"><button class="sm" onclick={() => openModal('cs', { cid: c.id, oid: o.id })}>문의</button>{#if o.status === 'PAID' && c.status !== 'SETTLED'}<button class="sm ghost" onclick={() => act.custRefund(o.id)}>환불 신청</button>{/if}</div></div>
			{/each}
		</div>
	{:else}
		<div class="card" style="padding:30px;text-align:center;color:var(--mute)">아직 주문이 없어요 — <button class="sm ghost" onclick={() => go.screen('home')}>진행 중인 판매 보기</button></div>
	{/if}
	<div class="card flex justify-between items-center gap-2.5 flex-wrap" style="margin-top:16px"><div class="flex items-center gap-2.5"><span class="kv-av" style="width:34px;height:34px;font-size:14px">{S.cust.name[0]}</span><div><b>{S.cust.name}</b><div class="meta">{S.cust.email || ''}{S.cust.email ? ' · ' : ''}카카오 계정 · {md(P(S.cust.at))} 가입</div></div></div><button class="sm ghost" onclick={() => { act.custLogout(); go.screen('home'); }}>로그아웃</button></div>
{/if}
