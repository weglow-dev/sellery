<script lang="ts">
	import { groupbuys } from '$lib/mock/groupbuys.svelte';
	import { app } from '$lib/state.svelte';
	import Modal from './Modal.svelte';

	/** 공구 링크 [강제 종료] 창(시안 linkEnd) — 공구 링크 목록 · 공구 링크 상세가 같이 쓴다.
	 *  설명 "크리에이터 · 상품" · 빨간 안내 · [강제 종료]. 거절 · 결과 문구는 서버(목) 값 */
	let { id, desc, onclose }: { id: string; desc: string; onclose: () => void } = $props();
</script>

<Modal
	title="강제 종료"
	{desc}
	ok="강제 종료"
	danger
	info="정말 강제 종료할까요? 종료하면 공구 링크가 닫히고 다시 열 수 없어요"
	infoTone="red"
	{onclose}
	onok={() => {
		const r = groupbuys.forceEnd(id);
		if (!r.ok) return r.msg;
		app.showToast(r.msg);
		onclose();
	}}
/>
