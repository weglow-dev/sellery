<script lang="ts">
	import { S, prod, brand, seller, spOf, samplePrice, sampleSplit, celBal, gname, fmt, CEL, SAMPLE_CEL_WON, act, closeModal, go } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	import PIcon from '../components/PIcon.svelte';
	import GradeBox from '../components/GradeBox.svelte';
	let { pid }: { pid: string } = $props();
	const p = $derived(prod(pid)), me = $derived(seller(S.actingSeller)), b = $derived(brand(p.brandId));
	const sp = $derived(spOf(p)), pr = $derived(samplePrice(p)), sl = $derived(sampleSplit(pr)), bal = $derived(celBal(S.actingSeller));
	const canCel = $derived(sl.cel > 0 && bal >= sl.cel);
	let method = $state<'cash' | 'cel'>('cash');
	$effect(() => { method = canCel ? 'cel' : 'cash'; });
</script>

<Modal>
	<h3 class="flex items-center gap-2">샘플 구매 — <PIcon {p} sz={26} /> {p.name}</h3>
	<div style="font-size:12.5px;color:var(--mute);margin:-8px 0 12px">{b.name} · 무상 기준 <GradeBox g={sp.freeGrade} /> 이상 · 내 등급 <GradeBox g={gname(me)} /></div>
	<table class="stmt" style="min-width:0;font-size:13px"><tbody>
		{#if sp.buyMode === 'fixed'}<tr><td>브랜드 지정 샘플가 (1회 한정)</td><td class="num"><b>₩{fmt(pr)}</b></td></tr>
		{:else}<tr><td>판매가</td><td class="num">₩{fmt(p.gp)}</td></tr><tr><td>− 내 수수료 {(p.rate * 100).toFixed(0)}%</td><td class="num">−₩{fmt(p.gp - pr)}</td></tr><tr class="tot"><td>샘플 구매가</td><td class="num">₩{fmt(pr)}</td></tr>{/if}
	</tbody></table>
	<div class="lbl-sm" style="margin:14px 0 6px">결제 수단</div>
	<label class="opt {method === 'cash' ? 'on' : ''}" style="display:flex;gap:10px"><input type="radio" bind:group={method} value="cash" style="width:auto" /> <span>현금 결제 (셀러리 안전결제)</span><b>₩{fmt(pr)}</b></label>
	<label class="opt {method === 'cel' ? 'on' : ''}" style="display:flex;gap:10px;margin-top:8px;{sl.cel ? '' : 'opacity:.5'}"><input type="radio" bind:group={method} value="cel" disabled={!canCel} style="width:auto" /> <span>셀러리 우선 결제 <span style="color:var(--mute)">(1{@html CEL} = ₩{fmt(SAMPLE_CEL_WON)} · 보유 {@html CEL} {bal})</span></span><b>{#if sl.cel}{@html CEL} {sl.cel}{sl.cash ? ' + ₩' + fmt(sl.cash) : ''}{:else}해당 없음{/if}</b></label>
	{#if sl.cel && !canCel}<div style="font-size:12px;color:var(--danger);margin-top:6px">셀러리 {sl.cel}개가 필요해요 (보유 {bal}) — <button class="underline bg-transparent border-0 p-0 shadow-none" style="box-shadow:none;margin:0;font:inherit;color:inherit" onclick={() => { closeModal(); go.screen('shop'); }}>셀러리 샵에서 충전</button></div>{/if}
	<p style="font-size:12px;color:var(--mute);margin-top:12px">구매 샘플은 브랜드 승인 없이 바로 발송 단계로 넘어가고, 이달 무상 한도를 쓰지 않습니다. 브랜드는 일반 판매 1건과 동일하게 정산받습니다(플랫폼 수수료 10% 동일).{#if sp.refund} <b>이 상품은 판매 확정 시 샘플 구매액을 환급합니다.</b>{/if}</p>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.confirmSampleBuy(pid, method)}>결제하고 샘플 받기</button></div>
</Modal>
