<script lang="ts">
	import { page } from '$app/state';
	import { cs } from '$lib/mock/cs.svelte';
	import { app } from '$lib/state.svelte';
	import { INPUT, TEXTAREA } from '$lib/ui';
	import ArmedButton from '$lib/components/ArmedButton.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import DetailHead from '$lib/components/DetailHead.svelte';
	import Field from '$lib/components/Field.svelte';
	import InfoRow from '$lib/components/InfoRow.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Note from '$lib/components/Note.svelte';
	import Timeline from '$lib/components/Timeline.svelte';

	/** 교환 · 환불 요청 상세 — docs/myr-admin-screens.md §8-2. 왼쪽 본문(고객 요청 · 사진 · 크리에이터 메시지 · 주문 · 배송 · 타임라인) + 오른쪽 고정 패널(단계 · 안내 · 단계별 버튼).
	 *  처리 대기 → [승인](처리 방법 = 서버 선택지 · 사유별 — 회수가 필요하면 이벗 회수 신청 / 회수 없는 재발송은 바로 재발송 / 회수 없는 환불은 바로 환불) · 회수 확인 필요 → 회수 칸(이벗 회수 접수 · 회수 운송장 · 실패면 [회수 다시 신청]) + [회수 확인](한 번 더 확인) · 재발송 → 교환 발송 칸(다음 영업일 11시 이벗 자동 발송) + 예외 [송장 직접 입력](모달) · 환불할 차례 → [환불 다시](한 번 더 확인) · 처리 대기 → [반려] [승인](모달 · 운영 대행).
	 *  칩 · 안내 · 버튼 · 모달 문구 · 결과 문구는 전부 서버(목) 값. 모바일은 오른쪽 패널이 본문 아래로 쌓인다 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(cs.claim(id));

	let modal = $state<'approve' | 'reject' | 'resend' | null>(null);
	const def = $derived(modal ? cs.claimModal(id, modal) : null);
	let pick = $state('');
	let msg = $state('');
	let tracking = $state('');

	function openModal(which: 'approve' | 'reject' | 'resend') {
		const d = cs.claimModal(id, which);
		pick = d?.options?.value ?? '';
		msg = '';
		tracking = '';
		modal = which;
	}
	const toast = (r: { ok: boolean; msg: string }) => app.showToast(r.msg, r.ok ? 'ok' : 'error');
	/** 모달 [확인] — 서버가 거절하면 이유(string)를 돌려줘 모달 안에 보여 주고, 되면 토스트 + 닫기 */
	function submit() {
		if (!modal) return;
		const r = modal === 'resend' ? cs.resend(id, pick, tracking) : modal === 'approve' ? cs.approve(id, pick, msg) : cs.reject(id, msg);
		if (!r.ok) return r.msg;
		app.showToast(r.msg);
		modal = null;
	}
	const PILL = 'h-[42px] rounded-xl border px-[15px] text-[13.5px] font-semibold transition-colors';
	const pillCls = (on: boolean) => `${PILL} ${on ? 'border-accent bg-accent/12 text-accent' : 'border-white/12 text-white/80 hover:border-white/35'}`;
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	{#if v}
		<DetailHead back="/cs?tab={v.tab}" backLabel="교환 · 환불 목록으로" title={v.title} sub={v.sub} thumb={v.thumb} />

		<div class="mt-5 grid gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<DetailCard title="고객 요청" chips={[v.request.chip]}>
					<p class="text-[15px] leading-[1.6] text-white/85">{v.request.text}</p>
				</DetailCard>

				{#if v.photos.length}
					<DetailCard title={v.photosTitle}>
						<div class="flex flex-wrap gap-2.5">
							{#each v.photos as ph (ph.label)}
								<div class="flex h-[104px] w-[104px] items-end rounded-xl p-2 text-[11.5px] font-semibold text-white/55" style:background={ph.bg} role="img" aria-label="고객 {ph.label}">{ph.label}</div>
							{/each}
						</div>
					</DetailCard>
				{/if}

				{#if v.message}
					<DetailCard title={v.message.title}>
						<p class="text-[15px] leading-[1.6] text-white/85">{v.message.text}</p>
					</DetailCard>
				{/if}

				<DetailCard title="주문 · 배송">
					{#each v.order as r (r.k)}
						<InfoRow k={r.k}>{r.v}</InfoRow>
					{/each}
				</DetailCard>

				<DetailCard title="타임라인">
					<Timeline items={v.timeline} />
				</DetailCard>
			</div>

			<aside class="flex flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-5 lg:sticky lg:top-7 lg:p-6">
				<DetailCard plain title="단계" chips={[v.stageChip]}>
					{#each v.side as r (r.k)}
						<InfoRow k={r.k} tone={r.tone}>
							{#if r.href}<a href={r.href} class="truncate hover:underline">{r.v}</a>{:else}<span class="truncate">{r.v}</span>{/if}
						</InfoRow>
					{/each}
				</DetailCard>

				{#if v.pickupBox}
					{@const b = v.pickupBox}
					<div class="border-t border-white/8 pt-5">
						<DetailCard plain title="회수" chips={[b.chip]}>
							{#each b.rows as r (r.k)}
								<InfoRow k={r.k} tone={r.tone}><span class="truncate">{r.v}</span></InfoRow>
							{/each}
							<p class="mt-2 text-[13px] leading-[1.5] {b.noteTone === 'red' ? 'font-semibold text-danger-fg' : 'text-white/55'}">{b.note}</p>
						</DetailCard>
					</div>
				{/if}
				{#if v.reshipBox}
					{@const b = v.reshipBox}
					<div class="border-t border-white/8 pt-5">
						<DetailCard plain title="교환 발송" chips={[b.chip]}>
							{#each b.rows as r (r.k)}
								<InfoRow k={r.k} tone={r.tone}><span class="truncate">{r.v}</span></InfoRow>
							{/each}
							<p class="mt-2 text-[13px] leading-[1.5] text-white/55">{b.note}</p>
						</DetailCard>
					</div>
				{/if}

				{#each v.notes as n (n.text)}
					<Note tone={n.tone} text={n.text} />
				{/each}

				{#if v.action === 'pickup' && v.armed}
					{#if v.pickupBox?.retry}
						<Btn kind="primary" full onclick={() => toast(cs.retryPickup(id))}>회수 다시 신청</Btn>
					{:else}
						<div class="flex"><ArmedButton label={v.armed.label} sure={v.armed.sure} note={v.armed.note} onconfirm={() => toast(cs.confirmPickup(id))} /></div>
					{/if}
				{:else if v.action === 'resend'}
					<Btn kind="ghost" full onclick={() => openModal('resend')}>송장 직접 입력</Btn>
				{:else if v.action === 'refund' && v.armed}
					<div class="flex"><ArmedButton label={v.armed.label} sure={v.armed.sure} note={v.armed.note} onconfirm={() => toast(cs.refundAgain(id))} /></div>
				{:else if v.action === 'decide'}
					<div class="flex gap-2">
						<button type="button" onclick={() => openModal('reject')} class="inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-danger/28 bg-danger/10 px-4 text-[14px] font-bold whitespace-nowrap text-danger-fg transition hover:brightness-110">반려</button>
						<div class="min-w-0 flex-1"><Btn kind="primary" full onclick={() => openModal('approve')}>승인</Btn></div>
					</div>
				{/if}
			</aside>
		</div>
	{:else}
		<DetailHead back="/cs" backLabel="교환 · 환불 목록으로" title="요청을 찾을 수 없어요" />
		<p class="mt-6 rounded-3xl border border-white/8 bg-white/3 px-5 py-14 text-center text-[14.5px] text-white/55">{id} 요청이 없어요 — 목록에서 다시 골라 주세요</p>
	{/if}
</div>

{#if modal && def}
	<Modal title={def.title} desc={def.desc} info={def.info} ok={def.ok} sure={def.sure} danger={modal === 'reject'} onok={submit} onclose={() => (modal = null)}>
		{#if def.options}
			{@const opts = def.options}
			<div class="flex flex-col gap-[7px]">
				<span class="text-[13px] font-semibold text-white/80" id="cs-opts-label">{opts.label}</span>
				<div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="cs-opts-label">
					{#each opts.items as it (it.id)}
						<button type="button" aria-pressed={pick === it.id} onclick={() => (pick = it.id)} class={pillCls(pick === it.id)}>{it.title}</button>
					{/each}
				</div>
				{#if opts.items.find((it) => it.id === pick)?.desc}<p class="text-[12.5px] leading-[1.45] text-white/55">{opts.items.find((it) => it.id === pick)?.desc}</p>{/if}
			</div>
		{/if}
		{#if def.tracking}
			<Field label={def.tracking.label}>
				<input bind:value={tracking} inputmode="numeric" placeholder={def.tracking.ph} class="{INPUT} tabular-nums" />
			</Field>
		{/if}
		{#if def.msg}
			<Field label={def.msg.label} count="{msg.length}/{def.msg.max}">
				<textarea bind:value={msg} rows="4" maxlength={def.msg.max} placeholder={def.msg.ph} class={TEXTAREA}></textarea>
			</Field>
		{/if}
	</Modal>
{/if}
