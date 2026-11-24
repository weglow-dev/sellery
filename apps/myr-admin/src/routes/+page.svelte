<script lang="ts">
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { HomeChip, HomeRow, HomeStep } from '$lib/mock/types';

	/** 홈 — 시안 "MYR Admin"(모바일) · "MYR Admin PC" 홈과 같게(2026-11-24 · docs/myr-admin-screens.md §3).
	 *  ① 히어로(10월분 아직 지급하지 않은 금액 · 토스 지급 가능 잔액) ② 세금계산서 확인 대기 · 심사 대기 상품
	 *  ③ 오늘 처리할 일(메뉴 8줄 고정 순서) ④ 정산 일정(10월분 지급 흐름 4단계).
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
							<span class="text-[12.5px] font-bold tabular-nums lg:text-[13px] {h.balShort ? 'text-danger-fg' : 'text-mint'}">{h.balNote}</span>
						</p>
					</div>
					{#if h.pend}<p class="mt-[3px] text-[12px] text-white/45 tabular-nums">들어올 예정 {h.pend}</p>{/if}
				</div>
				<button type="button" onclick={() => app.showToast(server.refreshBalance())} class="flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] border border-white/12 bg-white/6 pr-3 pl-2.5 text-[12.5px] font-bold whitespace-nowrap transition-colors hover:bg-white/12 lg:h-8 lg:rounded-[10px]"><Icon id="refresh" size={14} sw={2.2} />새로고침</button>
			</div>
		</section>

		<!-- ② 세금계산서 확인 대기 — 확인하면 다음 자동 이체(영업일 오후 1시)에 지급 -->
		<a href="/tax?tab=chk" class="flex min-w-0 flex-col justify-between gap-3.5 rounded-[22px] border border-accent/25 bg-accent/7 p-[18px] transition-colors hover:border-accent/55 lg:rounded-3xl lg:p-[22px]">
			<span class="flex items-center justify-between">
				<span class="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-accent/16 text-accent lg:h-10 lg:w-10"><Icon id="doc" size={19} /></span>
				<span class="text-[28px] font-extrabold tracking-[-0.04em] text-accent tabular-nums lg:text-[32px]">{h.tax.n}</span>
			</span>
			<span class="min-w-0">
				<span class="block text-[15px] leading-[1.35] font-bold lg:text-[16px] lg:leading-normal">세금계산서 확인 대기</span>
				{#if h.tax.when}
					<span class="mt-2 flex items-start gap-[5px] rounded-[10px] bg-mint/12 py-[7px] pr-[9px] pl-[7px] text-[12px] leading-[1.35] font-bold text-mint lg:mt-2.5 lg:inline-flex lg:h-8 lg:max-w-full lg:items-center lg:gap-1.5 lg:py-0 lg:pr-3 lg:pl-[9px] lg:text-[13px]">
						<span class="flex h-4 shrink-0 items-center lg:h-auto"><Icon id="bolt" size={14} /></span><span class="min-w-0 lg:truncate">{h.tax.when}</span>
					</span>
				{:else}
					<span class="mt-[3px] block text-[12px] text-white/55 lg:text-[13px]">확인할 세금계산서가 없어요</span>
				{/if}
			</span>
		</a>

		<!-- 심사 대기 상품 -->
		<a href="/products" class="flex min-w-0 flex-col justify-between gap-3.5 rounded-[22px] border border-white/8 bg-white/3 p-[18px] transition-colors hover:border-white/28 lg:rounded-3xl lg:p-[22px]">
			<span class="flex items-center justify-between">
				<span class="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-white/6 lg:h-10 lg:w-10"><Icon id="box" size={19} /></span>
				<span class="text-[28px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[32px]">{h.review.n}</span>
			</span>
			<span class="min-w-0">
				<span class="block text-[15px] leading-[1.35] font-bold lg:text-[16px] lg:leading-normal">심사 대기 상품</span>
				<span class="mt-[3px] block truncate text-[12px] text-white/55 lg:text-[13px]">{h.review.sub}</span>
			</span>
		</a>
	</div>

	<div class="mt-[26px] lg:mt-7 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch lg:gap-8">
		<!-- ③ 오늘 처리할 일 — 메뉴 8줄 · 빨강 칩 = 급한 일 -->
		<section class="flex flex-col" aria-labelledby="todo-h">
			<div class="flex items-baseline justify-between">
				<h2 id="todo-h" class="text-[19px] font-extrabold tracking-[-0.02em] lg:text-[20px]">오늘 처리할 일</h2>
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
			<div class="flex items-baseline justify-between">
				<h2 id="steps-h" class="text-[19px] font-extrabold tracking-[-0.02em] lg:text-[20px]">정산 일정</h2>
				<span class="text-[13px] text-white/50 lg:text-[14px]">10월분 지급 흐름</span>
			</div>
			<div class="mt-3 flex flex-1 flex-col rounded-[20px] border border-white/8 bg-white/3 px-2 pt-2 pb-1 lg:mt-3.5 lg:rounded-3xl lg:px-2.5 lg:py-2">
				<ol class="flex flex-1 flex-col">
					{#each h.steps as st, i (st.no)}
						<li class="flex lg:flex-1">
							<a href={st.href} class="flex w-full gap-3 rounded-2xl px-2.5 pt-3 transition-colors hover:bg-white/4 lg:gap-3.5 lg:px-3 lg:pt-3.5">
								<span class="flex w-6 shrink-0 flex-col items-center self-stretch">
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/16 text-[12px] font-extrabold text-accent">{st.no}</span>
									{#if i < h.steps.length - 1}<span class="mt-1.5 w-0.5 flex-1 rounded-[1px] bg-white/10"></span>{/if}
								</span>
								<span class="min-w-0 flex-1 pb-3.5">
									<span class="flex items-baseline justify-between gap-2.5">
										<span class="text-[15px] font-bold">{st.title}</span>
										<span class="whitespace-nowrap"><span class="text-[18px] font-extrabold tracking-[-0.02em] tabular-nums lg:text-[20px]">{st.val}</span><span class="ml-[3px] text-[12.5px] text-white/50 tabular-nums lg:text-[13px]">{st.of}</span></span>
									</span>
									<span class="mt-0.5 block text-[12px] text-white/45">{st.when}</span>
									<span class="mt-2 block h-[5px] overflow-hidden rounded-[3px] bg-white/8"><span class="block h-full rounded-[3px] bg-accent" style:width="{st.pct}%"></span></span>
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
