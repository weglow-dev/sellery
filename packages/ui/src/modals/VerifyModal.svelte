<script lang="ts">
	import { S, seller, PLAT_NAMES, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { chId }: { chId: string } = $props();
	const ch = $derived((seller(S.actingSeller).channels || []).find((c) => c.id === chId)!);
</script>

<Modal title="채널 인증 — {ch.handle}">
	<p style="font-size:13px;color:var(--mute);margin-top:-6px">본인 계정임을 확인해 사칭을 방지합니다. 아래 <b>1회용 코드</b>를 사용해 두 방법 중 하나로 인증하세요.</p>
	<div style="text-align:center;margin:16px 0">
		<span class="font-display" style="font-size:26px;font-weight:800;letter-spacing:.15em;background:var(--yellow);box-shadow:var(--pxb2);padding:5px 20px">{ch.vcode}</span>
		<div style="margin-top:10px"><button class="sm ghost" onclick={() => act.copyText(ch.vcode!, '인증 코드 복사됨')}>코드 복사</button></div>
	</div>
	<div class="grid g2">
		<div class="card" style="box-shadow:none"><div class="lbl-sm">방법 1 · 프로필 인증</div><p style="font-size:12.5px;color:var(--mute);margin:8px 0 0">{PLAT_NAMES[ch.platform]} 프로필 소개글(bio)에 코드를 붙여넣은 뒤 아래 확인 버튼을 누르세요. 확인 후 소개글에서 지워도 됩니다.</p></div>
		<div class="card" style="box-shadow:none"><div class="lbl-sm">방법 2 · DM 인증</div><p style="font-size:12.5px;color:var(--mute);margin:8px 0 0">해당 계정에서 셀러리 공식 계정 <b>@sellery.official</b>로 코드를 DM으로 보낸 뒤 확인 버튼을 누르세요.</p></div>
	</div>
	<p style="font-size:11.5px;color:var(--mute);margin-top:12px">실서비스: 프로필 크롤링/공식 API·DM 수신함 매칭으로 코드 존재를 자동 확인합니다. 프로토타입에서는 확인 버튼 클릭 시 즉시 성공 처리됩니다.</p>
	<div class="foot"><button onclick={closeModal}>나중에</button><button class="pri" onclick={() => act.confirmVerify(chId)}>인증 확인</button></div>
</Modal>
