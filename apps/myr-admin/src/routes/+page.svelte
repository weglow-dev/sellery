<script lang="ts">
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { HomeChip, HomeCycle, HomeRow, HomeStep } from '$lib/mock/types';

	/** 홈 — 시안 "MYR Admin"(모바일) · "MYR Admin PC" 홈과 같게(2026-11-24 · docs/myr-admin-screens.md §3).
	 *  ① 히어로(10월분 아직 지급하지 않은 금액 · 토스 지급 가능 잔액) ② 세금계산서 확인 대기 · 심사 대기 상품
	 *  ③ 처리할 일(메뉴 8줄 고정 순서) ④ 정산 일정(10월분 · 11월분 고르기 · 4단계 — 끝남 ✓ · 진행 중 · 아직).
	 *  숫자 · 문구 · 색 구분은 전부 서버(목) 값 server.home — 화면은 색 이름을 클래스로만 바꾼다 */
	const h = $derived(server.home);

	const CHIP_CLS: Record<HomeChip['tone'], string> = {
		red: 'bg-danger/14 text-danger-fg',
		orange: 'bg-white/6 text-white/80',
		grey: 'bg-white/6 text-white/55'
	};
	const CHIP_N: Record<HomeChip['tone'], string> = { red: 'text-danger-fg', orange: 'text-accent', grey: 'text-white/55' };
	const TILE_CLS: Record<HomeRow['tone'], string> = { red: 'bg-danger/14 text-danger-fg', orange: 'bg-accent/14 text-accent', grey: 'bg-white/6 text-white/45' };
	const STEP_DESC: Record<HomeStep['tone'], string> = { red: 'text-danger-fg', orange: 'text-[#ff9a66]', plain: 'text-white/50' };
	// 단계 상태(서버 state) → 동그라미 · 세로줄 · 막대 색 · 흐림
	const STEP_DOT: Record<HomeStep['state'], string> = {
		done: 'bg-mint/16 text-mint',
		now: 'bg-accent text-bg shadow-[0_0_0_4px_rgba(255,122,61,.18)]',
		wait: 'bg-white/7 text-white/40'
	};

	// 정산 일정 — 고른 회차(10월분 · 11월분)는 화면 상태 · 회차 목록과 단계 값은 서버
	let cyc = $state<HomeCycle['key']>('cur');
	const cycle = $derived(h.cycles.find((c) => c.key === cyc) ?? h.cycles[0]);
</script>

<div class="animate-up-in px-5 pb-8 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">홈</h1>

	<div class="mt-1 grid grid-cols-2 gap-3 lg:mt-0 lg:grid-cols-4 lg:gap-3.5">
		<!-- ① 히어로 — 아직 지급하지 않은 금액 · 토스 지급 가능 잔액 -->
		<section class="relative col-span-2 min-w-0 overflow-hidden rounded-3xl bg-panel p-[22px] lg:px-7 lg:py-[26px]" aria-label={h.heroLabel}>
			<div class="pointer-events-none absolute -top-20 -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))] lg:h-[280px] lg:w-[280px]"></div>
			<div class="relative flex items-center justify-between gap-3">
				<p class="text-[13px] font-bold text-white/55">{h.heroLabel}</p>
				<a href={h.payHref} class="flex shrink-0 items-center gap-0.5 text-[13px] font-bold whitespace-nowrap text-white/60 hover:text-fg">지급 보기<Icon id="chev" size={14} sw={2.4} /></a>
			</div>
			<p class="relative mt-2 text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[40px]">{h.heroValue}</p>
			<div class="relative mt-4 flex gap-7 lg:mt-[18px]">
				{#each h.heroStats as s (s.k)}
					<div>
						<p class="text-[12px] whitespace-nowrap text-white/50">{s.k}</p>
						<p class="mt-[3px] text-[15px] font-bold whitespace-nowrap tabular-nums lg:text-[17px] {s.warn ? 'text-accent' : ''}">{s.v}</p>
					</div>
				{/each}
			</div>
			<div class="relative mt-4 flex items-center gap-2.5 border-t border-white/8 pt-3.5 lg:mt-[18px]">
				<div class="min-w-0 flex-1">
					<div class="lg:flex lg:items-center lg:gap-2.5">
						<p class="text-[12px] text-white/50">토스 지급 가능 잔액</p>
						<p class="mt-[3px] flex items-baseline gap-2 whitespace-nowrap lg:mt-0 lg:items-center lg:gap-2.5">
							<span class="text-[15px] font-bold tabular-nums lg:text-[16px]">{h.bal}</span>
							<span class="text-[12.5px] font-bold tabular-nums lg:text-[13px] {h.balShort ? 'text-[#ff9a66]' : 'text-mint'}">{h.balNote}</span>
						</p>
					</div>
					<!-- 모자란 건 안내(모자랄 때만) · PC 는 같은 줄에 "들어올 예정"(모바일 시안에는 없다) -->
					{#if h.balMore || h.pend}
						<p class="mt-1 text-[12.5px] leading-[1.5] tabular-nums {h.balMore ? '' : 'hidden lg:block'}">
							{#if h.balMore}<span class="font-semibold text-white/72">{h.balMore}</span>{/if}
							{#if h.pend}<span class="hidden lg:inline">{#if h.balMore}<span class="mx-1.5 text-white/30">·</span>{/if}<span class="text-white/50">들어올 예정 {h.pend}</span></span>{/if}
						</p>
					{/if}
				</div>
				<button type="button" onclick={() => app.showToast(server.refreshBalance())} class="flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] border border-white/12 bg-white/6 pr-3 pl-2.5 text-[12.5px] font-bold whitespace-nowrap transition-colors hover:bg-white/12 lg:h-8 lg:rounded-[10px]"><Icon id="refresh" size={14} sw={2.2} />새로고침</button>
			</div>
		</section>

		<!-- ② 카드 두 개 — 모바일은 위아래로 쌓은 가로 카드(아이콘 · 글 · 숫자) · PC 는 히어로 옆 두 칸(lg:contents 로 그리드에 바로) -->
		<div class="col-span-2 flex flex-col gap-2.5 lg:contents">
			<!-- 세금계산서 확인 대기 — 확인하면 다음 자동 이체(영업일 오후 1시)에 지급 · 확인할 게 없으면(서버 tone grey) 회색 카드 -->
			<a href="/tax?tab=chk" class="flex min-w-0 items-center gap-3.5 rounded-[22px] border px-[18px] py-4 transition-colors lg:flex-col lg:items-stretch lg:justify-between lg:rounded-3xl lg:p-[22px] {h.tax.tone === 'grey' ? 'border-white/8 bg-white/3 hover:border-white/28' : 'border-accent/25 bg-accent/7 hover:border-accent/55'}">
				<span class="flex shrink-0 items-center justify-between">
					<span class="flex h-[38px] w-[38px] items-center justify-center rounded-xl lg:h-10 lg:w-10 {h.tax.tone === 'grey' ? 'bg-white/6' : 'bg-accent/16 text-accent'}"><Icon id="doc" size={19} /></span>
					<span class="hidden text-[32px] font-extrabold tracking-[-0.04em] tabular-nums lg:block {h.tax.tone === 'grey' ? '' : 'text-accent'}">{h.tax.n}</span>
				</span>
				<span class="min-w-0 flex-1 lg:flex-none">
					<span class="block text-[15px] leading-[1.35] font-bold lg:text-[16px] lg:leading-normal">세금계산서 확인 대기</span>
					{#if h.tax.when}
						<span class="mt-[7px] inline-flex h-auto max-w-full items-center gap-[5px] rounded-[10px] bg-mint/12 py-1.5 pr-[9px] pl-[7px] text-[12px] leading-[1.35] font-bold whitespace-nowrap text-mint lg:mt-2.5 lg:h-8 lg:gap-1.5 lg:py-0 lg:pr-3 lg:pl-[9px] lg:text-[13px]">
							<Icon id="bolt" size={14} class="shrink-0" /><span class="min-w-0 truncate">{h.tax.when}</span>
						</span>
					{:else}
						<span class="mt-[3px] block text-[12px] text-white/55 lg:text-[13px]">확인할 세금계산서가 없어요</span>
					{/if}
				</span>
				<span class="shrink-0 text-[28px] font-extrabold tracking-[-0.04em] tabular-nums lg:hidden {h.tax.tone === 'grey' ? '' : 'text-accent'}">{h.tax.n}</span>
			</a>

			<!-- 심사 대기 상품 -->
			<a href={h.review.href} class="flex min-w-0 items-center gap-3.5 rounded-[22px] border border-white/8 bg-white/3 px-[18px] py-4 transition-colors hover:border-white/28 lg:flex-col lg:items-stretch lg:justify-between lg:rounded-3xl lg:p-[22px]">
				<span class="flex shrink-0 items-center justify-between">
					<span class="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-white/6 lg:h-10 lg:w-10"><Icon id="box" size={19} /></span>
					<span class="hidden text-[32px] font-extrabold tracking-[-0.04em] tabular-nums lg:block">{h.review.n}</span>
				</span>
				<span class="min-w-0 flex-1 lg:flex-none">
					<span class="block text-[15px] leading-[1.35] font-bold lg:text-[16px] lg:leading-normal">심사 대기 상품</span>
					<span class="mt-[3px] block truncate text-[12px] text-white/55 lg:text-[13px]">{h.review.sub}</span>
				</span>
				<span class="shrink-0 text-[28px] font-extrabold tracking-[-0.04em] tabular-nums lg:hidden">{h.review.n}</span>
			</a>
		</div>
	</div>

	<div class="mt-[26px] lg:mt-7 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch lg:gap-8">
		<!-- ③ 처리할 일 — 메뉴 8줄 · 빨강 칩 = 급한 일 -->
		<section class="flex flex-col" aria-labelledby="todo-h">
			<div class="flex items-baseline justify-between">
				<h2 id="todo-h" class="text-[19px] font-extrabold tracking-[-0.02em] lg:text-[20px]">처리할 일</h2>
				<span class="text-[13px] font-bold lg:text-[14px] {h.hot ? 'text-danger-fg' : 'text-white/50'}">{h.hotText}</span>
			</div>
			<div class="mt-3 flex flex-1 flex-col overflow-hidden rounded-[20px] border border-white/8 bg-white/3 lg:mt-3.5 lg:rounded-3xl">
				<div class="-mt-px flex flex-1 flex-col">
					{#each h.rows as r (r.key)}
						<div class="relative flex items-start gap-3 border-t border-white/6 py-3.5 pr-3 pl-4 transition-colors hover:bg-white/4 lg:min-h-[68px] lg:flex-1 lg:items-center lg:gap-3.5 lg:px-5 lg:py-2.5">
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] lg:h-11 lg:w-11 lg:rounded-[14px] {TILE_CLS[r.tone]}"><Icon id={r.icon} size={22} sw={1.8} /></span>
							<div class="min-w-0 flex-1 lg:flex lg:items-center lg:gap-3.5">
								<!-- 줄 전체가 그 메뉴로 가는 링크(칩은 그 위에서 각자 필터로) -->
								<a href={r.href} class="block pt-[9px] text-[15px] font-bold after:absolute after:inset-0 lg:w-[104px] lg:shrink-0 lg:pt-0 lg:text-[16px]">{r.name}</a>
								<div class="mt-1.5 flex flex-wrap gap-1.5 lg:mt-0 lg:flex-1 lg:py-2">
									{#each r.chips as t (t.label)}
										<a href={t.href} class="relative z-[1] flex h-[30px] items-center gap-[5px] rounded-[9px] px-2.5 text-[12.5px] font-bold whitespace-nowrap transition-[filter] hover:brightness-130 lg:h-8 lg:gap-1.5 lg:rounded-[10px] lg:px-3 lg:text-[13px] {CHIP_CLS[t.tone]}">
											{t.label}<span class="font-extrabold tabular-nums {CHIP_N[t.tone]}">{t.n}</span>
										</a>
									{:else}
										<span class="text-[13px] text-white/40 lg:text-[14px]">처리할 일이 없어요</span>
									{/each}
								</div>
							</div>
							<span class="mt-2.5 shrink-0 text-white/40 lg:mt-0" aria-hidden="true"><Icon id="chev" size={18} sw={2.2} /></span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- ④ 정산 일정 — 10월분 지급 흐름 -->
		<section class="mt-[26px] flex flex-col lg:mt-0" aria-labelledby="steps-h">
			<div class="flex items-center justify-between">
				<h2 id="steps-h" class="text-[19px] font-extrabold tracking-[-0.02em] lg:text-[20px]">정산 일정</h2>
				<div class="-my-1 flex shrink-0 gap-0.5 rounded-full bg-white/5 p-[3px]" role="group" aria-label="정산 회차">
					{#each h.cycles as c (c.key)}
						<button type="button" onclick={() => (cyc = c.key)} aria-pressed={cycle.key === c.key} class="h-7 rounded-full px-3 text-[12.5px] font-bold whitespace-nowrap transition-colors {cycle.key === c.key ? 'bg-[#2a2c33] text-fg' : 'text-white/55 hover:text-fg'}">{c.label}</button>
					{/each}
				</div>
			</div>
			<div class="mt-3 flex flex-1 flex-col rounded-[20px] border border-white/8 bg-white/3 px-2 pt-2 pb-1 lg:mt-3.5 lg:rounded-3xl lg:px-2.5 lg:py-2">
				<ol class="flex flex-1 flex-col">
					{#each cycle.steps as st, i (st.no)}
						<li class="flex lg:flex-1">
							<a href={st.href} class="flex w-full gap-3 rounded-2xl px-2.5 pt-3 transition-colors hover:bg-white/4 lg:gap-3.5 lg:px-3 lg:pt-3.5">
								<span class="flex w-6 shrink-0 flex-col items-center self-stretch">
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold {STEP_DOT[st.state]}">{#if st.state === 'done'}<span aria-label="끝남">✓</span>{:else}{st.no}{/if}</span>
									{#if i < cycle.steps.length - 1}<span class="mt-1.5 w-0.5 flex-1 rounded-[1px] {st.state === 'done' ? 'bg-mint/40' : 'bg-white/10'}"></span>{/if}
								</span>
								<span class="min-w-0 flex-1 pb-3.5 {st.state === 'wait' ? 'opacity-45' : ''}">
									<span class="flex items-baseline justify-between gap-2.5">
										<span class="flex min-w-0 items-center gap-[7px]">
											<span class="text-[15px] font-bold">{st.title}</span>
											{#if st.pill}<span class="shrink-0 rounded-md bg-accent/16 px-[7px] py-0.5 text-[11px] font-extrabold whitespace-nowrap text-[#ff9a66]">{st.pill}</span>{/if}
										</span>
										<span class="whitespace-nowrap"><span class="text-[18px] font-extrabold tracking-[-0.02em] tabular-nums lg:text-[20px]">{st.val}</span>{#if st.of}<span class="ml-[3px] text-[12.5px] text-white/50 tabular-nums lg:text-[13px]">{st.of}</span>{/if}</span>
									</span>
									<span class="mt-0.5 block text-[12px] text-white/45">{st.when}</span>
									<span class="mt-2 block h-[5px] overflow-hidden rounded-[3px] bg-white/8"><span class="block h-full rounded-[3px] {st.state === 'done' ? 'bg-mint' : 'bg-accent'}" style:width="{st.pct}%"></span></span>
									<span class="mt-[7px] block text-[12.5px] font-semibold tabular-nums {STEP_DESC[st.tone]}">{st.desc}</span>
								</span>
							</a>
						</li>
					{/each}
				</ol>
				<p class="mx-2.5 mt-1 mb-2.5 flex items-start gap-2 border-t border-white/7 pt-3 text-[12.5px] leading-[1.55] text-white/55 lg:mx-3 lg:mb-3">
					<Icon id="info" size={15} sw={2.2} class="mt-0.5 shrink-0" /><span>{h.stepsNote}</span>
				</p>
			</div>
		</section>
	</div>
</div>
