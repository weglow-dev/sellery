<script lang="ts">
	import { D_, camp, prod, seller, stockLeft, gfull, strip, fmt, md, P, ymd, addD, today, act, closeModal, PRIORITY_TIER } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { cid }: { cid: string } = $props();
	const c = $derived(camp(cid)!);
	const p = $derived(prod(c.productId));
	const slots = $derived(D_().campaigns.filter((x) => x.productId === p.id && ['SCHEDULE_CONFIRMED', 'LIVE'].includes(x.status)));
	const left = $derived(stockLeft(p, cid));
	let start = $state(ymd(addD(today(), 7)));
	let len = $state(5);
	let qty = $state(0);
	$effect(() => { qty = Math.min(500, left); });
</script>

<Modal title="판매 일정 제안 — {p.name}">
	<div class="fld"><label>이 상품의 확정 기간 — {strip(gfull(PRIORITY_TIER)).trim()} 이상이 잡은 기간은 상위 등급만 진입 가능</label>
		<div class="slots">
			{#each slots as x}<div class="slot"><span class="rng">{md(P(x.start!))} – {md(P(x.end!))}</span><span>{seller(x.sellerId).handle} 확정</span></div>{:else}<div class="slot">아직 확정된 기간 없음</div>{/each}
		</div></div>
	<div class="fld"><label>시작일</label><input type="date" bind:value={start} min={ymd(addD(today(), 1))} /></div>
	<div class="fld"><label>기간</label><select bind:value={len}><option value={3}>3일</option><option value={5}>5일</option><option value={7}>7일</option></select></div>
	<div class="fld"><label>희망 배정 재고 <span class="font-normal">— 배정 가능 {fmt(left)}개</span></label><input type="number" bind:value={qty} min="50" step="50" max={left} /></div>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.proposeSchedule(cid, start, +len, +qty)}>승인 요청 보내기</button></div>
</Modal>
