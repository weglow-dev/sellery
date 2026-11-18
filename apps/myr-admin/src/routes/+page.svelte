<script lang="ts">
	import { NOW, server } from '$lib/mock/server.svelte';
	import { payModal } from '$lib/pay-modal.svelte';
	import { app } from '$lib/state.svelte';
	import { DOT_CLS, NOTE_CLS } from '$lib/tone';
	import Icon from '$lib/components/Icon.svelte';

	/** 홈 — 자동 이체 기준(docs/myr-admin-screens.md §3 · 2026-11-17 다시 정리).
	 *  ① 영업일 오후 1시 자동 이체 카드(다음 실행에 보낼 건 · 토스 잔액이 모자라 넘어가는 건(있을 때만) · 마지막 실행 · 크론 + 운영 확인 필요 — 결과 확인 · 운영 조치)
	 *  ② 돈을 풀어 주는 확인 두 가지(세금계산서 확인 대기 · 정산 정보 확인 대기)
	 *  ③ 오늘 처리할 일(묶음별 · 빨강이 있는 묶음이 위 · 건수 + 가장 오래 기다린 시간)
	 *  ④ 이번 달 정산 흐름(날짜보다 진행 건수).
	 *  "돈이 걸린 일" 큰 카드 묶음은 두지 않는다 — 같은 건이 ①과 ③에 이미 있다(같은 건을 두 번 보여 주지 않는다).
	 *  숫자 · 문구는 전부 서버(목) 값 — 메뉴 배지와 같은 기준(§1-1) */
	const sch = $derived(server.schedule);
	const blocked = $derived(server.blocked);
	const prov = $derived(server.provider);
	const tax = $derived(server.taxCard);
	const groups = $derived(server.homeGroups);
	const flow = $derived(server.flow);
	const hot = $derived(server.hotCount);
	const c = $derived(server.counts);
	const autoAlert = $derived(blocked.length > 0);

	const TASK_CLS = {
		red: 'bg-danger/14 text-danger-fg hover:bg-danger/22',
		orange: 'bg-accent/12 text-accent hover:bg-accent/20',
		grey: 'bg-white/5 text-white/60 hover:bg-white/9',
		plain: 'bg-white/6 text-white/85 hover:bg-white/10'
	};
	const N_CLS = { red: 'text-danger-fg', orange: 'text-accent', grey: 'text-white/60', plain: 'text-accent' };
</script>

<div class="animate-up-in px-5 pb-8 lg:mx-auto lg:max-w-[1200px] lg:px-10 lg:pt-8 lg:pb-12">
	<!-- 머리 — 기준 시각 · 급한 일 수 -->
	<div class="flex items-end justify-between gap-3">
		<div>
			<h1 class="text-[22px] font-extrabold tracking-[-0.02em] lg:text-[26px]">오늘 할 일</h1>
			<p class="mt-1 text-[13px] text-white/60 lg:text-[14px]">{NOW.date} {NOW.time} 기준</p>
		</div>
		<span class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-extrabold {hot ? 'bg-danger/14 text-danger-fg' : 'bg-white/6 text-white/60'}">
			<span class="h-1.5 w-1.5 rounded-full {hot ? 'bg-danger' : 'bg-white/40'}"></span>{hot ? `급한 일 ${hot}가지` : '급한 일이 없어요'}
		</span>
	</div>

	<div class="mt-5 grid gap-3 lg:mt-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-4">
		<!-- ① 영업일 오후 1시 자동 이체 -->
		<section class="relative overflow-hidden rounded-3xl border bg-panel p-5 lg:p-7 {autoAlert ? 'border-danger/35' : 'border-white/8'}" aria-label={sch.title}>
			<div class="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.32),rgba(21,22,26,0))]"></div>
			<div class="relative flex items-start justify-between gap-4">
				<a href="/payouts?tab=ready" class="group min-w-0">
					<span class="flex items-center gap-1 text-[13px] font-bold text-white/60 group-hover:text-fg">
						<Icon id="clock" size={15} sw={2.2} />{sch.title}<Icon id="chev" size={13} sw={2.4} />
					</span>
					<span class="mt-1 block text-[12px] text-white/55 lg:text-[13px]">{sch.rule}</span>
					<span class="mt-3 block text-[13px] font-bold text-accent tabular-nums">{sch.when}</span>
					<span class="mt-1 flex items-baseline gap-2.5">
						<span class="text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[40px]">{sch.sumText}</span>
						<span class="text-[15px] font-bold text-white/60 tabular-nums">{sch.n}건</span>
					</span>
					<span class="mt-1 block truncate text-[12px] text-white/55 lg:text-[13px]">{sch.namesText}</span>
				</a>
			</div>

			<!-- 토스 잔액은 충전하는 돈이 아니라 판매 정산대금 — 평소엔 숨기고, 모자라 다음 영업일로 넘어가는 건이 있을 때만(주황 · 운영 할 일 없음) -->
			{#if sch.deferText}
				<div class="relative mt-4 flex items-start gap-2.5 rounded-2xl bg-accent/10 px-4 py-3">
					<Icon id="clock" size={15} sw={2.2} class="mt-0.5 shrink-0 text-accent" />
					<p class="min-w-0 flex-1 text-[13px] leading-[1.55] text-white/85">{sch.deferText}</p>
					<button type="button" onclick={() => app.showToast(server.refreshBalance())} class="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/55 hover:text-fg lg:h-8 lg:w-8" aria-label="토스 잔액 새로고침"><Icon id="refresh" size={15} /></button>
				</div>
			{/if}

			<div class="relative mt-4 grid grid-cols-2 gap-2.5">
				<div class="rounded-2xl bg-white/4 px-4 py-3">
					<p class="text-[12px] text-white/60">마지막 실행</p>
					<p class="mt-1 text-[15px] font-bold tabular-nums">{prov.lastRun.at}</p>
					<p class="mt-0.5 text-[12px] font-semibold {sch.lastRunBad ? 'text-danger-fg' : 'text-white/55'}">{sch.lastRunText}</p>
				</div>
				<div class="rounded-2xl bg-white/4 px-4 py-3">
					<p class="text-[12px] text-white/60">자동 실행</p>
					{#each prov.crons as cr (cr.name)}
						<p class="mt-1 flex items-center gap-1.5 text-[13px] font-semibold">
							<span class="h-1.5 w-1.5 rounded-full {cr.ok ? 'bg-mint' : 'bg-danger'}"></span>{cr.name}
							<span class={cr.ok ? 'text-white/60' : 'text-danger-fg'}>{cr.ok ? '정상' : '안 돌았어요'}</span>
						</p>
					{/each}
				</div>
			</div>

			<!-- 운영 확인 필요 — 자동으로 다시 보내지 않는 실패만: 결과 확인 필요(웹훅 · 매시간 확인으로도 모름) · 운영 조치 필요(이체 한도) -->
			{#if blocked.length}
				<div class="relative mt-4 border-t border-white/8 pt-4">
					<p class="flex items-center gap-1.5 text-[13px] font-extrabold text-danger-fg"><Icon id="alert" size={15} sw={2.2} />운영 확인 필요 {blocked.length}건 · 자동으로 다시 보내지 않아요</p>
					<ul class="mt-2.5 flex flex-col gap-2">
						{#each blocked as b (b.id)}
							<li class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-danger/22 bg-danger/7 px-4 py-3 lg:flex-nowrap">
								<a href="/payouts?tab=fail&id={b.id}" class="min-w-0 flex-1">
									<span class="flex items-center gap-2 text-[14px] font-bold"><span class="rounded-md bg-danger/16 px-2 py-[2px] text-[12px] font-extrabold text-danger-fg">{b.label}</span><span class="tabular-nums">{b.who}</span></span>
									<span class="mt-1 block text-[13px] text-white/65">{b.why}</span>
								</a>
								<button type="button" onclick={() => payModal.show(b.action, [b.id])} class="h-11 shrink-0 rounded-xl bg-accent px-4 text-[14px] font-bold text-bg hover:brightness-110 lg:h-10">{b.action === 'record' ? '지급 완료 기록' : '다시 보내기'}</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		<!-- ② 돈을 풀어 주는 확인 — 확인하면 다음 자동 이체(영업일 오후 1시)에 나간다 -->
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-[auto_auto] lg:content-start lg:gap-4">
			<a href="/tax" class="flex flex-col justify-between gap-3 rounded-[20px] border p-4 transition-colors lg:rounded-3xl lg:p-6 {tax.n ? 'border-accent/30 bg-accent/8 hover:border-accent/55' : 'border-white/8 bg-white/3'}">
				<span class="flex items-center justify-between">
					<span class="flex h-10 w-10 items-center justify-center rounded-xl {tax.n ? 'bg-accent text-bg' : 'bg-white/6'}"><Icon id="doc" size={19} sw={2.1} /></span>
					<span class="text-[28px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[34px] {tax.n ? 'text-accent' : ''}">{tax.n}</span>
				</span>
				<span>
					<span class="block text-[15px] font-bold lg:text-[16px]">세금계산서 확인 대기</span>
					<span class="mt-0.5 block text-[12px] text-white/60 lg:text-[13px]">{tax.oldest}</span>
					{#if tax.when}<span class="mt-2 inline-flex items-center gap-1 rounded-md bg-mint/12 px-2 py-[3px] text-[12px] font-bold text-mint"><Icon id="bolt" size={12} sw={2.2} />{tax.when}</span>{/if}
				</span>
			</a>
			<a href="/creators?tab=wait" class="flex flex-col justify-between gap-3 rounded-[20px] border border-white/8 bg-white/3 p-4 transition-colors hover:border-white/28 lg:rounded-3xl lg:p-6">
				<span class="flex items-center justify-between">
					<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/6"><Icon id="user" size={19} /></span>
					<span class="text-[28px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[34px]">{c.settleWait}</span>
				</span>
				<span>
					<span class="block text-[15px] font-bold lg:text-[16px]">정산 정보 확인 대기</span>
					<span class="mt-0.5 block text-[12px] text-white/60 lg:text-[13px]">확인돼야 지급 보류가 풀려요</span>
					{#if c.settleAcct}<span class="mt-2 inline-flex items-center gap-1 rounded-md bg-danger/14 px-2 py-[3px] text-[12px] font-bold text-danger-fg">계좌 다시 입력 {c.settleAcct}명 · 확인하면 다시 보내요</span>{/if}
				</span>
			</a>
		</div>
	</div>

	<div class="mt-8 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
		<!-- ③ 오늘 처리할 일 -->
		<section aria-labelledby="todo-h">
			<div class="flex items-baseline justify-between">
				<h2 id="todo-h" class="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[20px]">오늘 처리할 일</h2>
				<span class="text-[12px] text-white/55 lg:text-[13px]">건수 · 가장 오래 기다린 시간</span>
			</div>
			<div class="mt-3 flex flex-col gap-2 lg:mt-3.5 lg:gap-0 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/8 lg:bg-white/3">
				{#each groups as g (g.key)}
					<div class="flex gap-3 rounded-[20px] border border-white/8 bg-white/3 p-4 lg:items-center lg:gap-4 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b-white/6 lg:bg-transparent lg:px-5 lg:py-4 lg:last:border-b-0">
						<a href={g.href} class="flex shrink-0 items-start gap-3 lg:w-[150px] lg:items-center">
							<span class="flex h-10 w-10 items-center justify-center rounded-xl {g.hot ? 'bg-danger/14 text-danger-fg' : 'bg-white/6 text-white/60'}"><Icon id={g.icon} size={19} /></span>
							<span class="hidden text-[15px] font-bold lg:block">{g.name}</span>
						</a>
						<div class="min-w-0 flex-1">
							<a href={g.href} class="mb-2 block text-[15px] font-bold lg:hidden">{g.name}</a>
							<div class="flex flex-wrap gap-1.5">
								{#each g.tasks as t (t.label)}
									<a href={t.href} title={t.hint} class="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold transition-colors {TASK_CLS[t.tone]}">
										{t.label}
										<span class="font-extrabold tabular-nums {N_CLS[t.tone]}">{t.value ?? t.n}</span>
										{#if t.oldest}<span class="text-[12px] font-semibold text-white/55">· {t.oldest}</span>{/if}
										{#if t.pcOnly}<span class="rounded bg-white/8 px-1 text-[10px] font-extrabold text-white/60 lg:hidden">PC에서 처리</span>{/if}
									</a>
								{:else}
									<span class="text-[13px] text-white/55">처리할 일이 없어요</span>
								{/each}
							</div>
							{#each g.tasks.filter((t) => t.hint && (t.tone === 'red' || t.tone === 'orange')) as t (t.label)}
								<p class="mt-1.5 text-[12px] text-white/55">{t.label} · {t.hint}</p>
							{/each}
						</div>
						<a href={g.href} class="hidden shrink-0 text-white/35 hover:text-fg lg:block" aria-label="{g.name} 열기"><Icon id="chev" size={18} sw={2.2} /></a>
					</div>
				{/each}
			</div>
		</section>

		<!-- ④ 이번 달 정산 흐름 -->
		<section class="mt-8 lg:mt-0" aria-labelledby="flow-h">
			<div class="flex items-baseline justify-between">
				<h2 id="flow-h" class="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[20px]">이번 달 정산 흐름</h2>
				<span class="text-[12px] text-white/55 lg:text-[13px]">10월분</span>
			</div>
			<ol class="mt-3 rounded-3xl border border-white/8 bg-white/3 p-2 lg:mt-3.5">
				{#each flow as s, i (s.title)}
					<li>
						<a href={s.href} class="relative flex gap-3.5 rounded-2xl px-3 py-3.5 transition-colors hover:bg-white/4">
							<span class="flex flex-col items-center">
								<span class="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-extrabold {i === flow.length - 1 ? 'border border-dashed border-white/25 text-white/60' : 'bg-white/8 text-white/80'}">{i + 1}</span>
								{#if i < flow.length - 1}<span class="mt-1 w-px flex-1 bg-white/10"></span>{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex items-baseline justify-between gap-2">
									<span class="text-[15px] font-bold">{s.title}</span>
									<span class="text-[15px] font-extrabold tabular-nums">{s.value}<span class="text-[12px] font-semibold text-white/55">{s.of}</span></span>
								</span>
								<span class="mt-0.5 block text-[12px] text-white/55">{s.when}</span>
								{#if s.pct !== null}
									<span class="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/8"><span class="block h-full rounded-full {s.tone === 'red' ? 'bg-danger' : s.tone === 'orange' ? 'bg-accent' : 'bg-mint'}" style:width="{s.pct}%"></span></span>
								{/if}
								<span class="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold {NOTE_CLS[s.tone]}">
									{#if s.tone !== 'plain'}<span class="h-1.5 w-1.5 rounded-full {DOT_CLS[s.tone]}"></span>{/if}{s.desc}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ol>
			<p class="mt-2.5 px-1 text-[12px] leading-[1.55] text-white/55">지급은 매월 1일 한 번이 아니라 세금계산서가 확인된 다음 자동 이체(영업일 오후 1시)에 건마다 나가요.</p>
		</section>
	</div>
</div>
