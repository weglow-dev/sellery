<script lang="ts">
	import { S, brand, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	import BrandGrade from '../components/BrandGrade.svelte';
</script>

<Modal title="브랜드 등급 · 혜택" wide>
	<BrandGrade b={brand(S.actingBrand)} compact />
	<div class="foot"><button class="pri" onclick={closeModal}>닫기</button></div>
</Modal>
