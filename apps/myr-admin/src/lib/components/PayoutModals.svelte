<script lang="ts">
	import { won } from '$lib/format';
	import { TODAY, server } from '$lib/mock/server.svelte';
	import { payModal } from '$lib/pay-modal.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT, TEXTAREA } from '$lib/ui';
	import Field from './Field.svelte';
	import KV from './KV.svelte';
	import Modal from './Modal.svelte';

	/** 지급 건 동작 모달 — 다시 보내기 · 운영 보류 · 보류 해제 · 지급 완료 기록 · 지급 완료 취소 · 이체용 내려받기 (§11-1 ~ §11-3).
	 *  레이아웃에 하나만 두고 payModal.show(동작, [id…]) 로 연다. 결과 · 거절 문구는 서버(목) 값 */
	const m = $derived(payModal.open);
	const list = $derived(m ? server.payouts.filter((p) => m.ids.includes(p.id)) : []);
	const one = $derived(list[0]);
	const sel = $derived(m ? server.selection(m.ids) : null);

	let memo = $state('');
	let date = $state(TODAY);
	let typed = $state('');
	let pick = $state('');
	/** 지급 완료 기록 — 머리 "더보기"에서 열면 대상 지급 건을 고른다(결과 확인 · 운영 조치 필요 건) */
	const recordable = $derived(server.payouts.filter((p) => p.actions.includes('record')));
	const recTarget = $derived(one ?? recordable.find((p) => p.id === pick));

	$effect(() => {
		if (m) {
			memo = '';
			date = TODAY;
			typed = '';
			pick = '';
		}
	});

	function done(msg: string) {
		app.showToast(msg);
		payModal.close();
	}
	const close = () => payModal.close();
</script>

{#if m?.action === 'resend' && one}
	<Modal
		title={list.length > 1 ? `${list.length}건 다시 보내기` : '다시 보내기'}
		desc={list.length > 1 ? `합계 ${sel?.sumText}` : `${one.name} · ${won(one.amount)}`}
		ok="다시 보내기"
		sure="정말 다시 보내기"
		info="누르면 바로 토스로 보내요 · 같은 건이 두 번 나가지 않게 막혀 있어요"
		onclose={close}
		onok={() => {
			for (const p of list) {
				const r = server.resend(p.id);
				if (!r.ok) return r.msg;
			}
			done(list.length > 1 ? `${list.length}건을 다시 보냈어요 · 송금 중` : `${one.name}에게 다시 보냈어요 · 송금 중`);
		}}
	>
		<div class="rounded-2xl bg-white/4 px-4 py-1">
			{#if list.length === 1}
				<KV k="실패 사유"><span class="text-danger-fg">{one.fail?.why}</span></KV>
				<KV k="받는 계좌">{one.account}</KV>
			{/if}
			<KV k="토스 지급 가능">{server.schedule.availableText}</KV>
		</div>
	</Modal>
{:else if m?.action === 'hold' && one}
	<Modal
		title={list.length > 1 ? `${list.length}건 운영 보류` : '운영 보류'}
		desc={list.length > 1 ? `합계 ${sel?.sumText}` : `${one.name} · ${won(one.amount)}`}
		ok="운영 보류"
		info="크리에이터에게는 '운영팀 확인 중'으로만 보여요 · 메모는 운영만 봐요 · 다음 자동 이체(오후 1시) 전에 걸면 그 이체에서 빠져요"
		disabled={!memo.trim()}
		onclose={close}
		onok={() => done(server.hold(m.ids, memo.trim()))}
	>
		<Field label="메모(필수)" count="{memo.length}/100">
			<textarea bind:value={memo} maxlength="100" rows="3" class={TEXTAREA} placeholder="예: 계좌 확인 요청 · 정지 검토 중"></textarea>
		</Field>
	</Modal>
{:else if m?.action === 'release' && one}
	<Modal
		title="보류 해제"
		desc="{one.name} · {won(one.amount)}"
		ok="보류 해제"
		info={one.releaseLeft ?? '해제하면 지금 상태로 다시 정해져요 · 보류 이유가 없으면 다음 자동 이체(영업일 오후 1시)에 보내요'}
		infoTone={one.releaseLeft ? 'orange' : 'plain'}
		onclose={close}
		onok={() => done(server.release(one.id))}
	>
		{#if one.opsHold}
			<div class="rounded-2xl bg-white/4 px-4 py-1">
				<KV k="운영 메모">{one.opsHold.memo}</KV>
				<KV k="보류한 사람">{one.opsHold.by}</KV>
			</div>
		{/if}
	</Modal>
{:else if m?.action === 'record'}
	<Modal
		title="지급 완료 기록"
		desc="지급대행에서 나간 걸 확인했거나 직접 이체했을 때 써요"
		ok="기록하기"
		sure="정말 지급 완료로 기록하기"
		info="기록하면 크리에이터 화면에 바로 지급 완료로 보여요"
		disabled={!recTarget || !typed}
		onclose={close}
		onok={() => {
			if (!recTarget) return;
			const r = server.recordPaid(recTarget.id, date, Number(typed.replace(/\D/g, '')), memo.trim());
			if (!r.ok) return r.msg;
			done(r.msg);
		}}
	>
		{#if !one}
			<Field label="지급 건">
				<select bind:value={pick} class="{INPUT} appearance-none">
					<option value="" disabled>고르세요</option>
					{#each recordable as p (p.id)}<option value={p.id}>{p.name} · {won(p.amount)} · {p.chips[0]?.label}</option>{/each}
				</select>
			</Field>
		{/if}
		{#if recTarget}
			<div class="rounded-2xl bg-white/4 px-4 py-1">
				<KV k="크리에이터">{recTarget.name} {recTarget.handle}</KV>
				<KV k="지급 건 금액" strong>{won(recTarget.amount)}</KV>
				<KV k="받는 계좌">{recTarget.account}</KV>
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-2.5">
			<Field label="이체한 날"><input type="date" bind:value={date} max={TODAY} class={INPUT} /></Field>
			<Field label="보낸 금액 확인"><input inputmode="numeric" bind:value={typed} oninput={(e) => (typed = e.currentTarget.value.replace(/[^\d,]/g, ''))} class={INPUT} placeholder="금액을 다시 입력" /></Field>
		</div>
		<Field label="메모(선택)"><input bind:value={memo} maxlength="100" class={INPUT} placeholder="예: 회사 계좌에서 직접 이체" /></Field>
	</Modal>
{:else if m?.action === 'cancelPaid' && one}
	<Modal title="지급 완료 취소" desc="{one.name} · {won(one.amount)} · {one.paid?.at}" ok="지급 완료 취소" sure="정말 취소하기" danger info="기록만 되돌려요. 이미 보낸 돈은 돌아오지 않아요" infoTone="red" disabled={!memo.trim()} onclose={close} onok={() => done(server.cancelPaid(one.id, memo.trim()))}>
		<Field label="사유(필수)" count="{memo.length}/100">
			<textarea bind:value={memo} maxlength="100" rows="3" class={TEXTAREA} placeholder="예: 다른 크리에이터 건을 잘못 기록함"></textarea>
		</Field>
	</Modal>
{:else if m?.action === 'download'}
	<Modal title="이체용 내려받기" desc="지급 대기 · 실패 건의 계좌 원문 CSV" ok="내려받기" info="계좌 원문이 담겨요 · 내려받으면 열람 기록이 남아요" infoTone="orange" onclose={close} onok={() => done('열람 기록을 남겼어요 · UI 단계라 파일은 만들지 않아요')} />
{/if}
