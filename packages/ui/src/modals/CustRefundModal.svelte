<script lang="ts">
	import { D_, camp, prod, fmt, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { oid }: { oid: string } = $props();
	const o = $derived(D_().orders.find((x) => x.id === oid)!), c = $derived(camp(o.campaignId)!), p = $derived(prod(c.productId));
</script>

<Modal title="환불 신청">
	<div style="font-size:13.5px;margin-bottom:10px"><b>{p.name}</b> · {o.opt || ''} × {o.qty} · <b>₩{fmt(o.unit * o.qty)}</b></div>
	<div class="notice" style="margin:0 0 12px">결제 대금은 <b>셀러리</b>가 보관 중이라 브랜드 확인을 기다리지 않고 바로 환불됩니다. 이미 발송된 상품은 회수 후 처리돼요.</div>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.custRefundGo(oid)}>환불 신청</button></div>
</Modal>
