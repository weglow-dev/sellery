<script lang="ts">
	import { S, D_, seller, brand, fmt, CEL, act, closeModal, toast } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { sid }: { sid: string } = $props();
	const s = $derived(seller(sid));
	const disp = $derived(s.hidden ? '○○○ 인플루언서 (익명)' : s.name + ' ' + s.handle);
	const myP = $derived(D_().products.filter((p) => p.brandId === S.actingBrand && p.status === 'listed'));
	let pid = $state('');
	let msg = $state('');
	$effect(() => { if (!pid && myP.length) pid = myP[0].id; msg = `안녕하세요${s.hidden ? '' : ' ' + s.name + '님'}, ${brand(S.actingBrand).name}입니다. 채널 결이 저희 상품과 잘 맞아 판매를 제안드려요. 샘플부터 보내드릴게요!`; });
	$effect(() => { if (!myP.length) { toast('노출 중인 상품이 없습니다 — 상품을 먼저 등록하세요'); closeModal(); } });
</script>

<Modal title="판매 직접 제안 — {disp}">
	<div class="fld"><label>제안할 상품</label><select bind:value={pid}>{#each myP as p}<option value={p.id}>{p.name} · 판매가 ₩{fmt(p.gp)} · 수수료 {(p.rate * 100).toFixed(0)}%</option>{/each}</select></div>
	<div class="fld"><label>제안 메시지</label><textarea rows="3" bind:value={msg}></textarea></div>
	<p style="font-size:12px;color:var(--mute)">인플루언서가 수락하면 샘플 발송 단계부터 시작됩니다 · 거절 시 사용한 제안권(다이아·블랙 {@html CEL} 10)은 자동 환급됩니다.</p>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.confirmInvite(sid, pid, msg)}>제안 보내기</button></div>
</Modal>
