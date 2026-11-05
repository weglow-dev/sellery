<script lang="ts">
	import { page } from '$app/state';
	import { MOCK_STATS, type Me } from '$lib/data';
	import { CS_TYPE_META, dueText, mockMonthRevenue, won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 홈 — 인사 · 이번 달 정산 예정 · 처리 대기 CS / 판매 중 제품 카드 · 오늘 처리할 일(대기 CS 3건) · 최근 7일 판매 막대.
	 *  모바일은 한 줄로 쌓고, PC(lg~)는 지표 3단(1.6 : 1 : 1) + 아래 2단(할 일 · 7일 판매, 합계와 막대 값 표시).
	 *  "판매 중 제품" 카드는 서버 값(+page.server.ts · 0071). 나머지 지표는 목(MOCK_STATS · mockMonthRevenue) — 실적 RPC(8번)를 붙이면 서버 값으로 바뀐다. */
	let { data } = $props();
	const live = $derived(app.products.filter((p) => p.status === 'live'));
	const monthUnits = $derived(live.reduce((n, p) => n + p.sold, 0));
	const today = $derived(app.pending.slice(0, 3));
	const maxDay = Math.max(...MOCK_STATS.week);
	const weekTotal = MOCK_STATS.week.reduce((a, b) => a + b, 0);
	/** 로그인한 크리에이터(sellers 행) — 사진은 방금 고른 미리보기(목 · 저장은 9번) → 등록된 프로필 사진 → 이니셜 */
	const me = $derived(page.data.me as Me);
	const photo = $derived(app.profilePhoto || me.avatarUrl);
	// 고객 문의 답변 대기(0075) — 홈에 올 때마다 서버 값으로 뱃지를 맞춘다
	$effect(() => {
		app.inqWaiting = data.inqWaiting;
	});
	const csCount = $derived(app.pending.length + data.inqWaiting);

	function pickPhoto(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) app.setProfilePhoto(f);
	}
</script>

<!-- PC: 최소 높이 = <main>(화면 − 상단 내비) — 아래 2단이 남은 높이를 채운다. 내용이 더 길면 그대로 스크롤 -->
<div class="no-bar min-h-0 flex-1 animate-up-in overflow-y-auto px-5 pb-6 lg:mx-auto lg:flex lg:min-h-full lg:w-full lg:max-w-[1240px] lg:flex-col lg:overflow-visible lg:px-10 lg:pt-7 lg:pb-10">
	<!-- 모바일 상단(로고 · 알림) — PC 는 상단 내비가 대신 -->
	<div class="flex h-[60px] items-center justify-between lg:hidden">
		<div class="flex items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-7 w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
		</div>
		<a href="/cs" aria-label="처리 대기 CS {csCount}건" class="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5 text-fg">
			<Icon id="bell" size={20} />
			{#if csCount}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-accent"></span>{/if}
		</a>
	</div>

	<div class="mt-1.5 flex items-center gap-3 lg:mt-0 lg:gap-3.5">
		<label class="relative h-14 w-14 shrink-0 cursor-pointer" aria-label="프로필 사진 등록">
			<span class="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full text-[19px] font-extrabold text-bg shadow-[0_0_0_2px_#0a0b0e,0_0_0_3.5px_rgba(255,255,255,.12)] lg:text-[20px]" style:background={me.avatarBg}>
				{#if photo}
					<img src={photo} alt="" class="absolute inset-0 h-full w-full object-cover" />
				{:else}
					{me.initial}
				{/if}
			</span>
			<input type="file" accept="image/*" onchange={pickPhoto} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
			{#if !photo}
				<span class="absolute -right-[3px] -bottom-[3px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-accent text-bg"><Icon id="cam" size={12} sw={2.4} /></span>
			{/if}
		</label>
		<div class="min-w-0 flex-1">
			<p class="truncate text-[18px] font-extrabold tracking-[-0.02em] lg:text-[22px]">{me.name}</p>
			<p class="mt-0.5 truncate text-[13px] text-white/50 lg:mt-[3px] lg:text-[14px]">{me.handle} · 오늘도 좋은 하루예요</p>
			{#if photo}
				<label class="relative mt-1.5 block w-fit cursor-pointer text-[12px] font-bold text-accent lg:hidden">
					사진 변경<input type="file" accept="image/*" onchange={pickPhoto} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
				</label>
			{/if}
		</div>
		<!-- 로그아웃 — 모바일은 여기, PC 는 상단 내비 오른쪽 -->
		<form method="POST" action="/auth/signout" class="shrink-0 lg:hidden">
			<button type="submit" class="h-9 rounded-xl border border-white/12 px-3 text-[12px] font-bold text-white/70">로그아웃</button>
		</form>
	</div>

	<div class="mt-5 grid grid-cols-2 gap-x-2.5 gap-y-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-3.5">
		<div class="relative col-span-2 overflow-hidden rounded-3xl bg-panel p-5 lg:col-span-1 lg:px-7 lg:py-[26px]">
			<div class="pointer-events-none absolute -top-[70px] -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))] lg:-top-20 lg:h-[280px] lg:w-[280px]"></div>
			<p class="relative text-[12px] font-bold text-white/55 lg:text-[13px]">이번 달 정산 예정</p>
			<p class="relative mt-1.5 text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:mt-2 lg:text-[40px]">{won(mockMonthRevenue(app.products))}</p>
			<div class="relative mt-3.5 flex gap-4 lg:mt-[18px] lg:gap-7">
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">주문</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px]">{MOCK_STATS.monthOrders.toLocaleString('ko-KR')}건</p></div>
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">판매 수량</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px]">{monthUnits.toLocaleString('ko-KR')}개</p></div>
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">CS 비율</p><p class="mt-0.5 text-[15px] font-bold text-accent lg:mt-[3px] lg:text-[17px]">{MOCK_STATS.csRate}</p></div>
			</div>
		</div>
		<a href="/cs" class="flex flex-col gap-2.5 rounded-[20px] border border-accent/25 bg-accent/8 p-4 text-left transition-colors lg:justify-between lg:gap-3.5 lg:rounded-3xl lg:p-[22px] lg:hover:border-accent/55">
			<span class="flex items-center justify-between">
				<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-bg lg:h-10 lg:w-10"><Icon id="cs" size={18} sw={2.2} class="lg:h-5 lg:w-5" /></span>
				<span class="text-[26px] font-extrabold tracking-[-0.04em] text-accent tabular-nums lg:text-[32px]">{csCount}</span>
			</span>
			<span>
				<span class="block text-[15px] font-bold lg:text-[16px]">처리 대기 CS</span>
				<span class="mt-0.5 block text-[12px] text-white/55 lg:mt-[3px] lg:text-[13px]">교환·환불 {app.pending.length} · 고객 문의 {data.inqWaiting}</span>
			</span>
		</a>
		<a href="/products" class="flex flex-col gap-2.5 rounded-[20px] border border-white/8 bg-white/3 p-4 text-left transition-colors lg:justify-between lg:gap-3.5 lg:rounded-3xl lg:p-[22px] lg:hover:border-white/28">
			<span class="flex items-center justify-between">
				<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 lg:h-10 lg:w-10"><Icon id="box" size={18} class="lg:h-5 lg:w-5" /></span>
				<span class="text-[26px] font-extrabold tracking-[-0.04em] tabular-nums lg:text-[32px]">{data.productCounts.live}</span>
			</span>
			<span>
				<span class="block text-[15px] font-bold lg:text-[16px]">판매 중 제품</span>
				<span class="mt-0.5 block text-[12px] text-white/55 lg:mt-[3px] lg:text-[13px]">{data.productCounts.pending}개 심사 · 임시저장</span>
			</span>
		</a>
	</div>

	<div class="lg:mt-7 lg:grid lg:flex-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch lg:gap-8">
		<section class="flex flex-col">
			<div class="mt-7 flex items-baseline justify-between lg:mt-0">
				<h2 class="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[20px]">오늘 처리할 일</h2>
				<a href="/cs" class="text-[13px] font-semibold text-white/50 transition-colors lg:text-[14px] lg:hover:text-fg">전체 보기</a>
			</div>
			<div class="mt-3 flex flex-col gap-2 lg:mt-3.5 lg:flex-1 lg:gap-2.5">
				{#each today as c (c.id)}
					{@const tm = CS_TYPE_META[c.type]}
					<a href="/cs/{c.id}" class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-left transition-colors lg:flex-1 lg:gap-3.5 lg:rounded-[20px] lg:p-4 lg:hover:border-white/28">
						<Tile tile={c.tile} icon={36} class="h-12 w-12 rounded-[14px] lg:h-14 lg:w-14 lg:rounded-2xl" />
						<span class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
							<span class="flex items-center gap-1.5"><Badge cls={tm.cls}>{tm.label}</Badge><span class="text-[11px] text-white/45 lg:text-[12px]"><span class="hidden lg:inline">{c.no} · </span>{c.ago}</span></span>
							<span class="truncate text-[14px] font-bold lg:text-[15px]">{c.product}</span>
							<span class="truncate text-[12px] text-white/55 lg:text-[13px]">{c.customer} · {c.reason}</span>
						</span>
						{#if c.urgent}
							<span class="hidden shrink-0 items-center gap-1.5 text-[12px] font-bold whitespace-nowrap text-accent lg:flex"><Icon id="clock" size={14} sw={2.2} />{dueText(c)}</span>
						{/if}
						<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
					</a>
				{:else}
					<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-white/50 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:rounded-[20px] lg:py-9">대기 중인 CS가 없어요. 수고했어요!</div>
				{/each}
			</div>
		</section>

		<section class="flex flex-col">
			<div class="mt-7 mb-3 flex items-baseline justify-between lg:mt-0 lg:mb-0">
				<h2 class="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[20px]">최근 7일 판매</h2>
				<span class="hidden text-[14px] text-white/50 lg:inline">합계 <b class="font-bold text-fg tabular-nums">{weekTotal}건</b></span>
			</div>
			<div class="rounded-[20px] border border-white/8 bg-white/3 px-4 pt-[18px] pb-3.5 lg:mt-3.5 lg:flex lg:flex-1 lg:flex-col lg:rounded-3xl lg:px-5 lg:pt-[22px] lg:pb-[18px]">
				<div class="flex h-[88px] items-end gap-2 lg:h-auto lg:min-h-[140px] lg:flex-1 lg:gap-2.5" role="img" aria-label="최근 7일 판매 수량 {MOCK_STATS.week.map((v, i) => `${MOCK_STATS.weekDays[i]} ${v}개`).join(', ')}">
					{#each MOCK_STATS.week as v, i (i)}
						{@const top = v === maxDay}
						<div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5 lg:gap-2">
							<span class="hidden text-[12px] font-bold tabular-nums lg:block {top ? 'text-accent' : 'text-white/45'}">{v}</span>
							<span class="w-full rounded-t-md rounded-b-[3px] transition-[height] duration-600 lg:rounded-t-lg lg:rounded-b-sm {top ? 'bg-accent' : 'bg-white/12'}" style:height="{Math.round((v / maxDay) * 100)}%"></span>
							<span class="text-[11px] font-semibold lg:text-[12px] {top ? 'text-accent' : 'text-white/45'}">{MOCK_STATS.weekDays[i]}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</div>
</div>
