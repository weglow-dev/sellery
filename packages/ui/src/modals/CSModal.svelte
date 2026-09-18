<script lang="ts">
	import { camp, prod, brand, CS_TYPES, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	import PIcon from '../components/PIcon.svelte';
	let { cid, oid = '' }: { cid: string; oid?: string } = $props();
	const c = $derived(camp(cid)!), p = $derived(prod(c.productId)), b = $derived(brand(p.brandId));
	let type = $state(CS_TYPES[0]), order = $state(oid ? oid.toUpperCase() : ''), msg = $state('');
</script>

<Modal>
	<h3 class="flex items-center gap-2">문의하기 — <PIcon {p} sz={24} /> {p.name}</h3>
	<div class="notice" style="margin:-4px 0 13px">이 문의는 <b>{b.name}</b>(공급 브랜드)에 바로 전달됩니다. 배송·교환·반품은 브랜드가 직접 처리하고, 결제·정산 문제는 셀러리가 함께 확인합니다.</div>
	<div class="fld"><label>문의 유형</label><select bind:value={type}>{#each CS_TYPES as t}<option>{t}</option>{/each}</select></div>
	<div class="fld"><label>주문번호 <span class="font-normal">(선택)</span></label><input bind:value={order} placeholder="예: O1153" /></div>
	<div class="fld"><label>문의 내용</label><textarea rows="4" bind:value={msg} placeholder="배송 상태, 교환·반품 사유 등을 적어주세요"></textarea></div>
	<p style="font-size:12px;color:var(--mute)">실서비스에서는 로그인 계정의 주문 내역에서 바로 문의를 접수하고, 답변은 카카오 알림톡으로 안내됩니다.</p>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.submitCS(cid, type, msg, order)}>문의 접수</button></div>
</Modal>
