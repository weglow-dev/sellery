<script lang="ts">
	import { COURIERS, act, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { oid }: { oid: string } = $props();
	let co = $state(COURIERS[0]), no = $state('');
</script>

<Modal title="운송장 입력 — {oid.toUpperCase()}">
	<div class="fld"><label>택배사</label><select bind:value={co}>{#each COURIERS as x}<option>{x}</option>{/each}</select></div>
	<div class="fld"><label>운송장 번호</label><input bind:value={no} inputmode="numeric" placeholder="6890-1234-5678" /></div>
	<div class="foot"><button onclick={closeModal}>취소</button><button class="pri" onclick={() => act.saveTrackOne(oid, co, no)}>저장 · 배송중 처리</button></div>
</Modal>
