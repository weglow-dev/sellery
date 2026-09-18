<script lang="ts">
	import { csList, camp, prod, md, P, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { id }: { id: string } = $props();
	const x = $derived(csList().find((v) => v.id === id)!);
	const c = $derived(camp(x.cid)), p = $derived(c && prod(c.productId));
	let rep = $state('');
	$effect(() => { rep = x.reply || ''; });
</script>

<Modal title="고객 문의 답변 — {x.type}">
	<div class="sub" style="color:var(--mute);font-size:12.5px;margin:-6px 0 12px">{p ? p.name : ''} · 주문 {x.orderId ? x.orderId.toUpperCase() : '—'} · {md(P(x.at))}</div>
	<div style="font-size:13px;background:var(--surface-2);border:1.5px solid var(--soft-line);padding:10px 12px;margin-bottom:13px">{x.msg}</div>
	<div class="fld"><label>답변</label><textarea rows="4" bind:value={rep} placeholder="처리 방법과 일정을 안내해주세요"></textarea></div>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.saveCSReply(id, rep)}>답변 보내기</button></div>
</Modal>
