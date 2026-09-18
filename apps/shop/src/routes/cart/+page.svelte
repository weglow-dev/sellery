<script lang="ts">
	import { S, cartLines, cartN, platIcon, fmt, md, P, CLEAR_DAYS, act, go } from '@sellery/core';
	import { PIcon } from '@sellery/ui';
	const L = $derived(cartLines()), okL = $derived(L.filter((x) => x.ok)), total = $derived(okL.reduce((a, x) => a + x.sum, 0));
</script>

{#if !L.length}
	<h2 class="pg">장바구니 <small>담아둔 상품이 없어요</small></h2>
	<div class="card" style="padding:34px;text-align:center"><div style="font-size:34px;margin-bottom:8px">🛒</div>진행 중인 판매 페이지에서 <b>장바구니</b>를 눌러 담아보세요<div class="btnrow" style="justify-content:center;margin-top:14px"><button class="pri sm" onclick={() => go.screen('home')}>진행 중인 판매 보기</button></div></div>
{:else}
	<h2 class="pg">장바구니 <small>{fmt(cartN())}개 · 기간 한정 가격 — 판매가 끝난 상품은 결제에서 자동으로 빠집니다</small></h2>
	<div class="cartgrid">
		<div class="listcard">
			{#each L as x}
				<div class="rowitem cart-row {x.ok ? '' : 'off'}"><PIcon p={x.p} sz={48} />
					<div class="grow" style="min-width:160px"><div class="nm" role="button" tabindex="0" onclick={() => go.store(x.c.id)} onkeydown={(e) => e.key === 'Enter' && go.store(x.c.id)} style="cursor:pointer">{x.p.name} <span class="sub" style="font-weight:400">· {x.b.name}</span></div>
						<div class="sub">{x.o.n} · {@html platIcon(x.s)} {x.s.name} {x.s.handle}{#if x.ok} · {md(P(x.c.end!))} 마감{:else if x.c.status === 'LIVE'} · <b style="color:var(--danger)">잔여 {Math.max(0, x.left)}개 — 수량을 줄여주세요</b>{:else} · <b style="color:var(--danger)">판매 종료</b>{/if}</div></div>
					<div class="qty sm"><button onclick={() => act.cartQty(x.i, -1)}>−</button><span>{x.it.qty}</span><button onclick={() => act.cartQty(x.i, 1)}>+</button></div>
					<div class="cart-sum">₩{fmt(x.sum)}</div>
					<button class="sm ghost" onclick={() => act.cartRemove(x.i)} aria-label="삭제" title="삭제">✕</button></div>
			{/each}
		</div>
		<div class="card cart-side"><h4 style="margin-top:0">결제 금액</h4>
			<table class="stmt" style="min-width:0;font-size:13px;width:100%"><tbody>{#each okL as x}<tr><td>{x.p.name} × {x.it.qty}</td><td class="num">₩{fmt(x.sum)}</td></tr>{:else}<tr><td colspan="2" style="color:var(--mute)">결제 가능한 상품이 없어요</td></tr>{/each}<tr><td>배송비</td><td class="num">무료 · 브랜드 직배송</td></tr><tr class="tot"><td>총 결제</td><td class="num">₩{fmt(total)}</td></tr></tbody></table>
			{#if L.length > okL.length}<div class="meta" style="margin:8px 0 0">결제할 수 없는 {L.length - okL.length}건은 제외됩니다</div>{/if}
			<button class="pri buy" disabled={!okL.length} style="width:100%;margin-top:12px;padding:14px" onclick={() => act.cartCheckout()}>{S.cust ? `₩${fmt(total)} 결제하기` : '카카오 로그인 후 결제'}</button>
			<div class="meta" style="text-align:center;margin-top:8px">결제 대금은 <b>셀러리</b>가 보관 · 판매 종료 후 {CLEAR_DAYS}일 환불 보호</div></div>
	</div>
{/if}
