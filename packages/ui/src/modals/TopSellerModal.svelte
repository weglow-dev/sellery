<script lang="ts">
	import { S, seller, gname, gfull, dataPrice, celBal, platIcon, fmt, CEL, act, closeModal, go } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { sid }: { sid: string } = $props();
	const s = $derived(seller(sid)), pr = $derived(dataPrice(s)), bal = $derived(celBal(S.actingBrand));
</script>

<Modal>
	<h3><span class="gradebox sm">{@html gfull(gname(s))}</span> ○○○ 인플루언서 <span class="st gray" style="animation:none">비공개</span></h3>
	<div class="font-display" style="font-size:23px;font-weight:800;margin:6px 0 2px">₩{fmt(s.m3Sales)} <span style="font-size:11px;color:var(--mute);font-weight:500">최근 3개월 매출</span></div>
	<div style="font-size:12.5px;color:var(--mute)">{@html platIcon(s)} {s.cat} 주력 · 팔로워 ●●●,●●● · 좋아요 평균 ●,●●● — 상세 지표 잠김</div>
	<p style="font-size:13px;margin:14px 0 4px">비공개 인플루언서는 레퍼런스를 열람한 뒤 판매 제안을 보낼 수 있습니다. 열람 시 팔로워·참여율·매출/팔로워 지표가 공개되고 제안 화면으로 바로 이동합니다.</p>
	<div style="font-size:12px;color:var(--mute)">열람 가격은 등급별 {@html CEL} 1–5 ({@html gfull(gname(s))} = {@html CEL} {pr}) · 보유 <b>{@html CEL} {bal}</b> · 사용 후 {@html CEL} {bal - pr}</div>
	<div class="foot"><button onclick={closeModal}>닫기</button><button onclick={() => { closeModal(); go.screen('shop'); }}>{@html CEL} 충전</button><button class="pri" onclick={() => act.unlockRef(sid, true)}>{@html CEL} {pr} · 구매해서 보기</button></div>
</Modal>
