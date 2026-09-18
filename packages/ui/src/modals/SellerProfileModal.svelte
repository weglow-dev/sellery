<script lang="ts">
	import { seller, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	import SellerCard from '../components/SellerCard.svelte';
	let { sid }: { sid: string } = $props();
	const s = $derived(seller(sid));
</script>

<Modal wide>
	<h3 class="flex items-center gap-2">인플루언서 프로필 <span class="st gray" style="animation:none">{s.hidden ? '비공개' : '공개'}</span></h3>
	<div class="profile-wrap"><SellerCard {s} /></div>
	<div class="foot"><button onclick={closeModal}>닫기</button></div>
</Modal>
