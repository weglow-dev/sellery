<script lang="ts">
	import { invites } from '$lib/mock/invites.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT } from '$lib/ui';
	import Field from './Field.svelte';
	import Modal from './Modal.svelte';

	/** 크리에이터 초대 보내기(§5-1) — 이메일만 받는다 → 보내면 초대 링크 창([링크 복사]).
	 *  메일 보낸 사람은 "MYR 파트너팀" 고정 · 초대한 운영자는 서버가 로그인 세션으로 남긴다(invited_by).
	 *  링크 원문은 이 창에서 한 번만 보인다(서버는 해시만 저장 · 0070). 거절 문구는 서버(목) 값 */
	let { onclose }: { onclose: () => void } = $props();

	let email = $state('');
	let done = $state<{ link: string; msg: string } | null>(null);
	let emailEl = $state<HTMLInputElement>();
	/** 창이 열리면 이메일 칸에 바로 커서 */
	$effect(() => emailEl?.focus());

	function send() {
		const r = invites.send(email);
		if (!r.ok) return r.msg;
		done = { link: r.link, msg: r.msg };
	}
	async function copy() {
		if (!done) return;
		try {
			await navigator.clipboard.writeText(done.link);
			app.showToast('초대 링크를 복사했어요');
		} catch {
			app.showToast('복사하지 못했어요 · 링크를 직접 선택해 복사해 주세요', 'error');
		}
	}
</script>

{#if !done}
	<Modal title="초대 보내기" desc="가입은 운영팀이 보낸 초대 링크로만 할 수 있어요" ok="초대 보내기" disabled={!email.trim()} {onclose} onok={send}>
		<Field label="받는 사람 이메일" hint="MYR 파트너팀 이름으로 초대 메일이 가요 · 링크는 7일 동안 쓸 수 있어요">
			<input bind:this={emailEl} bind:value={email} type="email" inputmode="email" autocomplete="off" placeholder="name@example.com" class={INPUT} />
		</Field>
	</Modal>
{:else}
	<Modal title="초대를 보냈어요" desc={email.trim().toLowerCase()} ok="링크 복사" info={done.msg} {onclose} onok={() => void copy()}>
		<div class="flex flex-col gap-1.5 rounded-[14px] bg-white/4 px-4 py-3">
			<span class="text-[12px] text-white/55">초대 링크</span>
			<span class="text-[14px] font-semibold break-all select-all tabular-nums">{done.link}</span>
		</div>
	</Modal>
{/if}
