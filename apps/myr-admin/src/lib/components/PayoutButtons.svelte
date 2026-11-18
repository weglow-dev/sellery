<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PayoutAction, PayoutView } from '$lib/mock/types';
	import { payModal } from '$lib/pay-modal.svelte';
	import Btn from './Btn.svelte';

	/** 지급 건 버튼 — 어떤 버튼이 보일지는 서버 값 actions(§11-1 상태별 버튼). max = 표 줄에서 보일 개수.
	 *  지급 완료 기록은 서버가 맨 앞에 둔 경우(결과 확인 필요)만 버튼 — 그 밖에는 서랍 아래 글자 링크 */
	let { p, sm = false, max = 9, full = false }: { p: PayoutView; sm?: boolean; max?: number; full?: boolean } = $props();

	const LABEL: Record<PayoutAction, string> = {
		record: '지급 완료 기록',
		resend: '다시 보내기',
		openCreator: '크리에이터 열기',
		openTax: '세금계산서 열기',
		hold: '운영 보류',
		release: '보류 해제',
		cancelPaid: '지급 완료 취소'
	};
	const shown = $derived(p.actions.filter((a, i) => a !== 'record' || i === 0).slice(0, max));
	const primary = (a: PayoutAction, i: number) => a === 'resend' || (a === 'record' && i === 0);

	function run(a: PayoutAction) {
		if (a === 'openCreator') goto(`/creators?id=${p.creatorId}`);
		else if (a === 'openTax') goto(`/tax?id=${p.taxId}`);
		else payModal.show(a, [p.id]);
	}
</script>

{#each shown as a, i (a)}
	<div class={full ? 'min-w-0 flex-1' : ''}>
		<Btn kind={primary(a, i) ? 'primary' : 'line'} {sm} {full} onclick={() => run(a)}>{LABEL[a]}</Btn>
	</div>
{/each}
