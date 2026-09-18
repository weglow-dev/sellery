<script lang="ts">
	import { S, seller, PLAT_NAMES, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { chId }: { chId: string | null } = $props();
	const ch = chId ? (seller(S.actingSeller).channels || []).find((c) => c.id === chId) : null;
	let v = $state({ platform: ch?.platform || 'instagram', handle: ch?.handle || '', url: ch?.url || '', followers: ch?.followers || 0 });
</script>

<Modal title={ch ? '채널 수정' : '채널 추가'}>
	<div class="fld"><label>플랫폼</label><select bind:value={v.platform}>{#each Object.entries(PLAT_NAMES) as [k, l]}<option value={k}>{l}</option>{/each}</select></div>
	<div class="fld"><label>계정 핸들 / 채널명</label><input bind:value={v.handle} placeholder="@my_account" /></div>
	<div class="fld"><label>채널 URL</label><input bind:value={v.url} placeholder="instagram.com/my_account" /></div>
	<div class="fld"><label>팔로워 수</label><input type="number" bind:value={v.followers} placeholder="실서비스에선 API로 자동 수집" /></div>
	<p style="font-size:12px;color:var(--mute)">저장 후 <b>인증 절차</b>를 거쳐야 브랜드에 노출됩니다. 수정하면 인증이 초기화됩니다(사칭 방지).</p>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.saveChannel(chId, { ...$state.snapshot(v), followers: +v.followers || 0 })}>저장</button></div>
</Modal>
