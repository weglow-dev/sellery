<script lang="ts">
	import { page } from '$app/state';
	import { cs } from '$lib/mock/cs.svelte';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import Btn from '$lib/components/Btn.svelte';
	import DetailCard from '$lib/components/DetailCard.svelte';
	import DetailHead from '$lib/components/DetailHead.svelte';
	import Field from '$lib/components/Field.svelte';
	import InfoRow from '$lib/components/InfoRow.svelte';

	/** 고객 문의 상세 — docs/myr-admin-screens.md §7-1 스레드. 왼쪽 대화(메신저 말풍선 · 고객 왼쪽 · 답변 오른쪽 · 운영 대행 표시) + 오른쪽 패널(문의 정보 · 대행 답변 입력 · [종료]).
	 *  칩 · 안내 · 결과 문구는 서버(목) 값 · 종료한 문의는 입력칸이 없다. 모바일은 패널이 대화 아래로 */
	const id = $derived(page.params.id ?? '');
	const v = $derived(cs.inquiry(id));

	let text = $state('');
	let err = $state('');
	// 다른 문의로 옮기면 입력칸을 비운다
	$effect(() => {
		void id;
		text = '';
		err = '';
	});

	function send() {
		const r = cs.reply(id, text);
		if (!r.ok) {
			err = r.msg;
			return;
		}
		err = '';
		text = '';
		app.showToast(r.msg);
	}
	function close() {
		const r = cs.closeInquiry(id);
		app.showToast(r.msg, r.ok ? 'ok' : 'error');
	}
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	{#if v}
		<DetailHead back="/cs/inquiries?tab={v.tab}" backLabel="고객 문의 목록으로" title={v.title} sub={v.sub} />

		<div class="mt-5 grid gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
			<div class="flex min-w-0 flex-col gap-3.5">
				<DetailCard title="대화">
					<ol class="flex flex-col gap-3.5">
						{#each v.msgs as m, i (i)}
							<li class="flex {m.who === 'c' ? 'justify-start' : 'justify-end'}">
								<div class="flex max-w-[78%] flex-col gap-[5px] {m.who === 'c' ? 'items-start' : 'items-end'}">
									<span class="text-[12px] font-semibold text-white/55">{m.name}</span>
									<p class="px-3.5 py-[11px] text-[15px] leading-[1.55] break-words {m.who === 'c' ? 'rounded-[4px_16px_16px_16px] bg-white/6' : 'rounded-[16px_4px_16px_16px] bg-accent/16'}">{m.text}</p>
									<span class="text-[11.5px] text-white/55 tabular-nums">{m.time}</span>
								</div>
							</li>
						{/each}
					</ol>
				</DetailCard>
			</div>

			<aside class="flex flex-col gap-5 rounded-3xl border border-white/8 bg-white/3 p-5 lg:sticky lg:top-7 lg:p-6">
				<DetailCard plain title="문의 정보" chips={[v.chip]}>
					{#each v.info as r (r.k)}
						<InfoRow k={r.k}>
							{#if r.href}<a href={r.href} class="truncate hover:underline">{r.v}</a>{:else}<span class="truncate">{r.v}</span>{/if}
						</InfoRow>
					{/each}
				</DetailCard>

				{#if v.canReply}
					<DetailCard plain title={v.reply.title}>
						<form
							class="flex flex-col gap-3"
							onsubmit={(e) => {
								e.preventDefault();
								send();
							}}
						>
							<Field label="답변" count="{text.length}/{v.reply.max}">
								<textarea bind:value={text} rows="5" maxlength={v.reply.max} placeholder={v.reply.ph} class={TEXTAREA}></textarea>
							</Field>
							<p class="text-[12.5px] font-semibold text-[#ff9a66]">{v.reply.note}</p>
							{#if err}<p class="text-[13px] font-semibold text-danger-fg" role="alert">{err}</p>{/if}
							<Btn kind="primary" full type="submit">{v.reply.ok}</Btn>
						</form>
					</DetailCard>
				{/if}

				{#if v.canClose}
					<Btn kind="ghost" full onclick={close}>종료</Btn>
				{/if}
			</aside>
		</div>
	{:else}
		<DetailHead back="/cs/inquiries" backLabel="고객 문의 목록으로" title="문의를 찾을 수 없어요" />
		<p class="mt-6 rounded-3xl border border-white/8 bg-white/3 px-5 py-14 text-center text-[14.5px] text-white/55">{id} 문의가 없어요 — 목록에서 다시 골라 주세요</p>
	{/if}
</div>
