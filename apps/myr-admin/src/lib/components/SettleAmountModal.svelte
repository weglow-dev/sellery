<script lang="ts">
	import { settle } from '$lib/mock/settle.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT } from '$lib/ui';
	import Field from './Field.svelte';
	import Modal from './Modal.svelte';

	/** [제조금액 입력](원장 없음 · 보류 확정) · [제조 차수 추가] — 같은 모달(시안 ledNew · ledAdd).
	 *  금액은 적는 대로 천 단위 쉼표 · 힌트에 보증금 25% · 제목 · 안내 · 버튼 이름은 서버 값. 거절(₩10,000 미만)은 onok 이 문자열을 돌려줘 Modal 이 보여 준다 */
	let { productId, onclose, ondone }: { productId: string; onclose: () => void; ondone?: () => void } = $props();

	let amtText = $state('');
	let memo = $state('');
	const amount = $derived(Number(amtText.replace(/\D/g, '')) || 0);
	const m = $derived(settle.amountModal(productId, amount));
	const fmt = (s: string) => {
		const n = s.replace(/\D/g, '');
		return n ? Number(n).toLocaleString('ko-KR') : '';
	};
</script>

<Modal
	title={m.title}
	desc={m.desc}
	ok={m.ok}
	info={m.info}
	infoTone="grey"
	{onclose}
	onok={() => {
		const r = settle.addRound(productId, amount, memo);
		if (!r.ok) return r.msg;
		app.showToast(r.msg);
		onclose();
		ondone?.();
	}}
>
	<Field label="제조금액" hint={m.hint}>
		<div class="relative">
			<span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-bold text-white/55">₩</span>
			<input value={amtText} oninput={(e) => (amtText = fmt(e.currentTarget.value))} inputmode="numeric" placeholder="예: 400,000" class="{INPUT} pl-9 font-bold tabular-nums" />
		</div>
	</Field>
	<Field label="메모 (선택)">
		<input bind:value={memo} maxlength="40" placeholder="예: 초도 2,000포" class={INPUT} />
	</Field>
</Modal>
