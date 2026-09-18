<script lang="ts">
	import { S, D_, camp, prod, seller, brand, fmt, CLEAR_DAYS, openModal, closeModal, go } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { ids }: { ids: string[] } = $props();
	const os = $derived(ids.map((id) => D_().orders.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o));
	const total = $derived(os.reduce((a, o) => a + o.unit * o.qty, 0));
</script>

<Modal title="주문 완료 ✓">
	<div class="notice" style="margin:8px 0 12px">결제 금액은 <b>셀러리</b>가 안전하게 보관하고, 판매 종료 후 교환/환불 기간({CLEAR_DAYS}일)이 지나면 브랜드·인플루언서에게 정산됩니다.</div>
	<table class="stmt" style="min-width:0;font-size:13px"><tbody>
		{#each os as o}
			{@const c = camp(o.campaignId)!}{@const p = prod(c.productId)}{@const s = seller(c.sellerId)}
			<tr><td>{o.id.toUpperCase()}</td><td class="num">{p.name} · {o.opt || ''} × {o.qty} · <b>₩{fmt(o.unit * o.qty)}</b><div style="font-size:11.5px;color:var(--mute);font-weight:400">{s.name} {s.handle} · {brand(p.brandId).name} 직배송</div></td></tr>
		{/each}
		{#if os.length > 1}<tr class="tot"><td>총 결제</td><td class="num">₩{fmt(total)}</td></tr>{/if}
	</tbody></table>
	<p style="font-size:12px;color:var(--mute);margin-top:10px">{#if S.cust}<b>{S.cust.name}</b>님의 <b>내 주문</b>에서 배송·환불을 관리할 수 있어요. {/if}운송장은 카카오 알림톡으로 안내됩니다. 실서비스에서는 이 단계에서 PG 결제창이 열립니다.</p>
	<div class="foot">
		{#if os.length}<button onclick={() => openModal('cs', { cid: os[0].campaignId, oid: os[0].id })}>문의하기</button>{/if}
		{#if S.cust}<button onclick={() => { closeModal(); go.screen('orders'); }}>내 주문</button>{/if}
		<button class="pri" onclick={closeModal}>확인</button>
	</div>
</Modal>
