<script lang="ts">
	/** 마이 "내 문의" — 아코디언(대표 시안 2026-11-02). 접힌 줄: 상품 타일 · 상태 칩 · 유형 · 상대 시각 · 첫 질문(0064 first_body) · 크리에이터 · 상품.
	 *  펼치면 GET /api/cs/<code>(세션 user.id) 로 스레드를 한 번 읽어 말풍선으로 — 내 문의(회색 상자 · 첫 질문엔 주문번호) · 크리에이터 답변(주황 테두리). 답변 대기면 안내 줄.
	 *  추가 문의는 [문의 화면에서 이어서 묻기] → /cs/<code>. */
	import { csSenderLabel, relTime, type CsConversation, type CsMessage, type CsThread } from '$lib/cs-rules';
	import Tile from '$lib/components/Tile.svelte';

	let { items }: { items: CsConversation[] } = $props();
	let open = $state<Record<string, boolean>>({});
	let threads = $state<Record<string, { state: 'loading' | 'error' } | { state: 'ok'; messages: CsMessage[] }>>({});

	const chip: Record<string, { label: string; cls: string }> = {
		OPEN: { label: '답변 대기', cls: 'bg-white/10 text-white/70' },
		ANSWERED: { label: '답변 완료', cls: 'bg-[#4ade80]/14 text-[#4ade80]' },
		CLOSED: { label: '처리 종료', cls: 'bg-white/6 text-white/45' }
	};

	async function toggle(code: string) {
		open = { ...open, [code]: !open[code] };
		const t = threads[code];
		if (!open[code] || (t && t.state !== 'error')) return;
		threads = { ...threads, [code]: { state: 'loading' } };
		try {
			const res = await fetch(`/api/cs/${encodeURIComponent(code)}`);
			// 서버(getCsThread)가 이미 파싱한 CsThread 를 돌려준다 — 여기서 다시 파싱하지 않는다
			const body = (await res.json().catch(() => null)) as { ok: boolean; thread?: CsThread } | null;
			const thread = body?.ok && body.thread && Array.isArray(body.thread.messages) ? body.thread : null;
			threads = { ...threads, [code]: thread ? { state: 'ok', messages: thread.messages } : { state: 'error' } };
		} catch {
			threads = { ...threads, [code]: { state: 'error' } };
		}
	}
	const initial = (name: string) => (name.trim()[0] ?? 'M').toUpperCase();
</script>

<div class="flex flex-col gap-2.5">
	{#each items as q (q.id)}
		{@const c = chip[q.status] ?? chip.CLOSED}
		{@const isOpen = !!open[q.code]}
		{@const t = threads[q.code]}
		<div class="rounded-[18px] border bg-white/3 transition-colors lg:rounded-[20px] {isOpen ? 'border-white/14' : 'border-white/8'}">
			<button type="button" onclick={() => toggle(q.code)} aria-expanded={isOpen} aria-controls="inq-{q.code}" class="flex w-full items-center gap-3 px-4 py-3.5 text-left text-fg lg:gap-3.5 lg:px-4 lg:py-4">
				{#if q.product}<Tile tile={q.product.tile ?? ''} ic={q.product.icon} thumbUrl={q.product.thumbUrl} alt="" icon={22} class="h-11 w-11 rounded-xl" />{/if}
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-1.5 text-[11.5px] text-fg-faint"><span class="rounded-[6px] px-1.5 py-[2px] text-[11px] font-bold {c.cls}">{c.label}</span>{q.type} · {relTime(q.lastMessageAt)}</span>
					<span class="mt-1 block truncate text-[14px] font-bold lg:text-[15px]">{q.firstBody ?? q.lastPreview ?? '문의'}</span>
					<span class="mt-0.5 block truncate text-[12px] text-fg-faint">{q.seller?.name ?? '크리에이터'} · {q.product?.name ?? ''}</span>
				</span>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-fg-faint transition-transform {isOpen ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
			</button>
			{#if isOpen}
				<div id="inq-{q.code}" class="flex flex-col gap-2.5 px-4 pb-4">
					{#if !t || t.state === 'loading'}
						<p class="py-3 text-center text-[13px] text-fg-faint">불러오는 중…</p>
					{:else if t.state === 'error'}
						<p class="py-3 text-center text-[13px] text-fg-faint">문의를 불러오지 못했어요 — <a href="/cs/{q.code}" class="font-bold text-accent">문의 화면에서 보기</a></p>
					{:else if t.state === 'ok'}
						{#each t.messages as m, i (m.id)}
							{#if m.sender === 'customer'}
								<div class="rounded-[14px] bg-white/5 px-4 py-3">
									<p class="text-[11.5px] text-fg-faint">내 문의 · {relTime(m.createdAt)}</p>
									{#if i === 0 && q.orderCode}<p class="mt-1 text-[12px] text-fg-soft">주문번호 <span class="font-mono">{q.orderCode.toUpperCase()}</span></p>{/if}
									<p class="mt-1.5 text-[14px] leading-[1.6] whitespace-pre-wrap break-words">{m.body}</p>
								</div>
							{:else}
								{@const who = csSenderLabel(m.sender, q.seller?.name)}
								<div class="rounded-[14px] border border-accent/30 bg-accent/6 px-4 py-3">
									<p class="flex items-center gap-2 text-[11.5px] text-fg-faint"><span class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#f6c3a8] text-[11px] font-bold text-bg">{initial(who)}</span><span class="text-[12.5px] font-bold text-accent">{who}</span>{relTime(m.createdAt)}</p>
									<p class="mt-2 text-[14px] leading-[1.6] whitespace-pre-wrap break-words">{m.body}</p>
								</div>
							{/if}
						{/each}
						{#if q.status === 'OPEN'}
							<p class="flex items-center gap-1.5 px-1 text-[12px] text-fg-faint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>답변을 기다리고 있어요 · 보통 1영업일 안에 답변돼요</p>
						{/if}
						{#if q.status !== 'CLOSED'}
							<a href="/cs/{q.code}" class="self-end px-1 text-[12.5px] font-bold text-accent">문의 화면에서 이어서 묻기 →</a>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>
