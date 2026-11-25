<script lang="ts">
	import Btn from './Btn.svelte';

	/** 되돌릴 수 없는 동작(§1-2 · 시안 two) — 첫 클릭에 [취소] [정말 ○○하기] + 빨간 안내 한 줄로 바뀐다(브라우저 확인창 없이).
	 *  kind=danger 는 처음엔 테두리 버튼, 두 번째는 빨강 채움. 자리를 차지하는 버튼 하나(full) */
	let { label, sure, note, kind = 'primary', disabled = false, sm = false, onconfirm }: { label: string; sure: string; note?: string; kind?: 'primary' | 'danger'; disabled?: boolean; sm?: boolean; onconfirm: () => void } = $props();
	let armed = $state(false);
</script>

<div class="flex min-w-0 flex-1 flex-col gap-2">
	{#if armed}
		<div class="flex gap-2">
			<div class="min-w-0 flex-1"><Btn kind="ghost" full {sm} onclick={() => (armed = false)}>취소</Btn></div>
			<div class="min-w-0 flex-[1.4]">
				<Btn kind={kind === 'danger' ? 'danger' : 'primary'} full {sm} onclick={() => {
					armed = false;
					onconfirm();
				}}>{sure}</Btn>
			</div>
		</div>
		{#if note}<p class="text-[12.5px] leading-[1.45] font-semibold text-danger-fg">{note}</p>{/if}
	{:else}
		<Btn kind={kind === 'danger' ? 'line' : 'primary'} full {sm} {disabled} onclick={() => (armed = true)}>{label}</Btn>
	{/if}
</div>
