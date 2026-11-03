<script lang="ts">
	import { ME, MOCK_STATS } from '$lib/data';
	import { CS_TYPE_META, mockMonthRevenue, won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 홈 — 인사 · 이번 달 정산 예정 · 처리 대기 CS / 판매 중 제품 카드 · 오늘 처리할 일(대기 CS 3건) · 최근 7일 판매 막대.
	 *  지표는 목(MOCK_STATS · mockMonthRevenue) — 실적 RPC(myr_app_seller_sales)를 붙이면 서버 값으로 바뀐다. */
	const live = $derived(app.products.filter((p) => p.status === 'live'));
	const monthUnits = $derived(live.reduce((n, p) => n + p.sold, 0));
	const today = $derived(app.pending.slice(0, 3));
	const maxDay = Math.max(...MOCK_STATS.week);

	function pickPhoto(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) app.setProfilePhoto(f);
	}
</script>

<div class="no-bar min-h-0 flex-1 animate-up-in overflow-y-auto px-5 pb-6">
	<div class="flex h-[60px] items-center justify-between">
		<div class="flex items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-7 w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
		</div>
		<a href="/cs" aria-label="처리 대기 CS {app.pending.length}건" class="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5 text-fg">
			<Icon id="bell" size={20} />
			{#if app.pending.length}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-accent"></span>{/if}
		</a>
	</div>

	<div class="mt-1.5 flex items-center gap-3">
		<label class="relative h-14 w-14 shrink-0 cursor-pointer" aria-label="프로필 사진 등록">
			<span class="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full text-[19px] font-extrabold text-bg shadow-[0_0_0_2px_#0a0b0e,0_0_0_3.5px_rgba(255,255,255,.12)]" style:background={ME.avatarBg}>
				{#if app.profilePhoto}
					<img src={app.profilePhoto} alt="" class="absolute inset-0 h-full w-full object-cover" />
				{:else}
					{ME.initial}
				{/if}
			</span>
			<input type="file" accept="image/*" onchange={pickPhoto} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
			{#if !app.profilePhoto}
				<span class="absolute -right-[3px] -bottom-[3px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-accent text-bg"><Icon id="cam" size={12} sw={2.4} /></span>
			{/if}
		</label>
		<div>
			<p class="text-[18px] font-extrabold tracking-[-0.02em]">{ME.name}</p>
			<p class="mt-0.5 text-[13px] text-white/50">{ME.handle} · 오늘도 좋은 하루예요</p>
			{#if app.profilePhoto}
				<label class="relative mt-1.5 block w-fit cursor-pointer text-[12px] font-bold text-accent">
					사진 변경<input type="file" accept="image/*" onchange={pickPhoto} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
				</label>
			{/if}
		</div>
	</div>

	<div class="relative mt-5 overflow-hidden rounded-3xl bg-panel p-5">
		<div class="pointer-events-none absolute -top-[70px] -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))]"></div>
		<p class="relative text-[12px] font-bold text-white/55">이번 달 정산 예정</p>
		<p class="relative mt-1.5 text-[34px] font-extrabold tracking-[-0.04em] tabular-nums">{won(mockMonthRevenue(app.products))}</p>
		<div class="relative mt-3.5 flex gap-4">
			<div><p class="text-[11px] text-white/50">주문</p><p class="mt-0.5 text-[15px] font-bold tabular-nums">{MOCK_STATS.monthOrders.toLocaleString('ko-KR')}건</p></div>
			<div><p class="text-[11px] text-white/50">판매 수량</p><p class="mt-0.5 text-[15px] font-bold tabular-nums">{monthUnits.toLocaleString('ko-KR')}개</p></div>
			<div><p class="text-[11px] text-white/50">CS 비율</p><p class="mt-0.5 text-[15px] font-bold text-accent">{MOCK_STATS.csRate}</p></div>
		</div>
	</div>

	<div class="mt-3 grid grid-cols-2 gap-2.5">
		<a href="/cs" class="flex flex-col gap-2.5 rounded-[20px] border border-accent/25 bg-accent/8 p-4 text-left">
			<span class="flex items-center justify-between">
				<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-bg"><Icon id="cs" size={18} sw={2.2} /></span>
				<span class="text-[26px] font-extrabold tracking-[-0.04em] text-accent tabular-nums">{app.pending.length}</span>
			</span>
			<span>
				<span class="block text-[15px] font-bold">처리 대기 CS</span>
				<span class="mt-0.5 block text-[12px] text-white/55">교환 · 환불 요청</span>
			</span>
		</a>
		<a href="/products" class="flex flex-col gap-2.5 rounded-[20px] border border-white/8 bg-white/3 p-4 text-left">
			<span class="flex items-center justify-between">
				<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/6"><Icon id="box" size={18} /></span>
				<span class="text-[26px] font-extrabold tracking-[-0.04em] tabular-nums">{app.liveCount}</span>
			</span>
			<span>
				<span class="block text-[15px] font-bold">판매 중 제품</span>
				<span class="mt-0.5 block text-[12px] text-white/55">{app.draftCount}개 심사 · 임시저장</span>
			</span>
		</a>
	</div>

	<div class="mt-7 flex items-baseline justify-between">
		<h2 class="text-[17px] font-extrabold tracking-[-0.02em]">오늘 처리할 일</h2>
		<a href="/cs" class="text-[13px] font-semibold text-white/50">전체 보기</a>
	</div>
	<div class="mt-3 flex flex-col gap-2">
		{#each today as c (c.id)}
			{@const tm = CS_TYPE_META[c.type]}
			<a href="/cs/{c.id}" class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-left">
				<Tile tile={c.tile} icon={36} class="h-12 w-12 rounded-[14px]" />
				<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
					<span class="flex items-center gap-1.5"><Badge cls={tm.cls}>{tm.label}</Badge><span class="text-[11px] text-white/45">{c.ago}</span></span>
					<span class="truncate text-[14px] font-bold">{c.product}</span>
					<span class="truncate text-[12px] text-white/55">{c.customer} · {c.reason}</span>
				</span>
				<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
			</a>
		{:else}
			<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-white/50">대기 중인 CS가 없어요. 수고했어요!</div>
		{/each}
	</div>

	<h2 class="mt-7 mb-3 text-[17px] font-extrabold tracking-[-0.02em]">최근 7일 판매</h2>
	<div class="rounded-[20px] border border-white/8 bg-white/3 px-4 pt-[18px] pb-3.5">
		<div class="flex h-[88px] items-end gap-2" role="img" aria-label="최근 7일 판매 수량 {MOCK_STATS.week.map((v, i) => `${MOCK_STATS.weekDays[i]} ${v}개`).join(', ')}">
			{#each MOCK_STATS.week as v, i (i)}
				{@const top = v === maxDay}
				<div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
					<span class="w-full rounded-t-md rounded-b-[3px] transition-[height] duration-600 {top ? 'bg-accent' : 'bg-white/12'}" style:height="{Math.round((v / maxDay) * 100)}%"></span>
					<span class="text-[11px] font-semibold {top ? 'text-accent' : 'text-white/45'}">{MOCK_STATS.weekDays[i]}</span>
				</div>
			{/each}
		</div>
	</div>
</div>
