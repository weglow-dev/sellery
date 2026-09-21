<script lang="ts">
	/**
	 * 문의하기 모달 (프로토타입 js/40-brand.js csModal · ux-spec §4.2 · web cs-modal.tsx CsModal).
	 * 슬라이스 1 은 `/api/cs`(cs_conversations 저장)가 없다 — 문의 유형·내용 입력 대신 주문번호(복사)·문의 유형 안내와 고객센터 채널 링크(COMPANY.csUrl, mailto)만.
	 * 원문 유지: 제목 `문의하기 — {pIcon} {product.name}` · .notice "이 문의는 {brand}(공급 브랜드)에 바로 전달됩니다 …" · CS_TYPES.
	 * 기존 `modals/CSModal.svelte`(데모) 와 이름이 겹쳐 site/index.ts 는 `SiteCsModal` 로 내보낸다.
	 */
	import { COMPANY } from '@sellery/db/company';
	import Modal from './Modal.svelte';
	import ProductIcon from './ProductIcon.svelte';
	import { showToast } from './toast.svelte';
	import { CS_TYPES } from './constants';

	let {
		open,
		onClose,
		productName,
		thumbUrl,
		emoji,
		brandName,
		orderCode = null
	}: { open: boolean; onClose: () => void; productName: string; thumbUrl: string | null; emoji: string; brandName: string; orderCode?: string | null } = $props();

	const code = $derived(orderCode ? orderCode.toUpperCase() : '');
	const external = /^https?:\/\//.test(COMPANY.csUrl);

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			showToast('주문번호 복사됨');
		} catch {
			showToast('복사 실패 — 수동으로 복사해주세요');
		}
	}
</script>

<Modal {open} {onClose}>
	{#snippet title()}문의하기 — <ProductIcon {thumbUrl} {emoji} size={24} /> {productName}{/snippet}
	<div class="notice" style="margin:-4px 0 13px">이 문의는 <b>{brandName}</b>(공급 브랜드)에 바로 전달됩니다. 배송·교환·반품은 브랜드가 직접 처리하고, 결제·정산 문제는 셀러리가 함께 확인합니다.</div>
	{#if code}
		<div class="fld">
			<label for="cs-order-code">주문번호</label>
			<div style="display:flex;align-items:center;gap:6px">
				<input id="cs-order-code" value={code} readonly style="flex:1;min-width:0" />
				<button type="button" class="sm ghost" onclick={copy}>복사</button>
			</div>
			<div class="hint">문의할 때 주문번호를 함께 남겨 주시면 빠르게 확인됩니다.</div>
		</div>
	{/if}
	<div class="fld">
		<!-- svelte-ignore a11y_label_has_associated_control — web 원문과 같은 마크업(연결 컨트롤 없는 안내 라벨) -->
		<label>문의 유형</label>
		<div style="font-size:13px">{CS_TYPES.join(' / ')}</div>
	</div>
	<p style="font-size:12.5px">
		문의 접수는 셀러리 고객센터(이메일)에서 받고 있어요 — 인플루언서 DM이 아닌 셀러리로 접수해주세요. 메일: <a href="mailto:{COMPANY.email}" style="text-decoration:underline">{COMPANY.email}</a>
	</p>
	{#snippet footer()}
		<button type="button" onclick={onClose}>닫기</button>
		<a href={COMPANY.csUrl} class="btn pri" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>✉️ {COMPANY.csLabel}</a>
	{/snippet}
</Modal>
