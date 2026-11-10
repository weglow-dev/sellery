<script lang="ts">
	import { page } from '$app/state';
	import { csRateText, weekBars } from '@sellery/myr-core/seller-sales';
	import { monthLabel, settleAtLabel } from '@sellery/myr-core/seller-settlement';
	import type { Me } from '$lib/data';
	import { inqTypeCls } from '$lib/inquiry';
	import { relativeTime } from '$lib/product-row';
	import { CS_TYPE_META, dueText, isUrgentPending } from '$lib/claims';
	import { won } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 홈 — 인사 · 이번 달 정산 예정 · 처리 대기 CS / 판매 중 제품 카드 · 오늘 처리할 일(대기 CS 3건) · 최근 7일 판매 막대.
	 *  모바일은 한 줄로 쌓고, PC(lg~)는 지표 3단(1.6 : 1 : 1) + 아래 2단(할 일 · 7일 판매, 합계와 막대 값 표시).
	 *  서버 값(+page.server.ts): 판매 중 제품 · 이번 달 순매출 · 주문 · 판매 수량 · CS 비율 · 최근 7일 주문(0076) · 고객 문의 답변 대기.
	 *  큰 숫자는 시안의 "정산 예정" 대신 **이번 달 순매출**(매출 − 환불) — 정산 비율이 정해지면 정산 예정액으로 바꾼다(2026-11-06 대표 결정 · docs/myr.md §9-6).
	 *  CS 비율 = 환불이 생긴 주문 ÷ 주문. 오늘 처리할 일 = 처리 대기 교환 · 환불(0078 · 오래된 순) + 답변 대기 문의(오래된 순) 합쳐 3건. */
	let { data } = $props();
	const sales = $derived(data.sales);
	const bars = $derived(weekBars(sales.week));
	const weekTotal = $derived(sales.week.reduce((n, d) => n + d.orders, 0));
	const todayClaims = $derived(data.todayClaims);
	const todayInq = $derived(data.todayInquiries);
	/** 로그인한 크리에이터(sellers 행) — 사진은 방금 고른 미리보기(목 · 저장은 9번) → 등록된 프로필 사진 → 이니셜 */
	const me = $derived(page.data.me as Me);
	const photo = $derived(me.avatarUrl);
	// 고객 문의 답변 대기(0075) · 교환 · 환불 처리 대기(0078) — 홈에 올 때마다 서버 값으로 뱃지를 맞춘다
	$effect(() => {
		app.inqWaiting = data.inqWaiting;
		app.claimWaiting = data.claimWaiting;
	});
	const csCount = $derived(data.claimWaiting + data.inqWaiting);
	const needsSettle = $derived(data.settleStatus === 'none' || data.settleStatus === 'rejected');

</script>

{#snippet settleBanner()}
	<a href="/my" class="flex w-full items-center gap-3 rounded-2xl border border-[#ff6b6b]/35 bg-[#ff6b6b]/10 px-4 py-3 text-[13px] lg:gap-4 lg:px-5 lg:text-[14px]">
		<span class="min-w-0 flex-1 leading-[1.5]"><b class="font-bold text-[#ff8a8a]">{data.settleStatus === 'rejected' ? '사업자 · 정산 정보를 다시 입력해 주세요' : '사업자 · 정산 정보를 입력해 주세요'}</b><span class="block text-white/65">정보가 확인돼야 정산금이 지급돼요</span></span>
		<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-[#ff8a8a]" />
	</a>
{/snippet}

<!-- PC: 최소 높이 = <main>(화면 − 상단 내비) — 아래 2단이 남은 높이를 채운다. 내용이 더 길면 그대로 스크롤 -->
<div class="no-bar min-h-0 flex-1 animate-up-in overflow-y-auto px-5 pb-6 lg:mx-auto lg:flex lg:min-h-full lg:w-full lg:max-w-[1240px] lg:flex-col lg:overflow-visible lg:px-10 lg:pt-7 lg:pb-10">
	<!-- 모바일 상단(로고 · 알림 · 내 계정 메뉴) — PC 는 상단 내비가 대신 -->
	<div class="flex h-[60px] items-center justify-between lg:hidden">
		<div class="flex items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-7 w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
		</div>
		<div class="flex items-center gap-2.5">
			<a href="/cs" aria-label="처리 대기 CS {csCount}건" class="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5 text-fg">
				<Icon id="bell" size={20} />
				{#if csCount}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-accent"></span>{/if}
			</a>
			<UserMenu />
		</div>
	</div>

	<div class="mt-1.5 flex items-center gap-3 lg:mt-0 lg:gap-3.5">
		<!-- 프로필 사진 — 보기만(바꾸기는 내 정보 · 0085). 누르면 내 정보로 -->
		<a href="/my" class="relative h-14 w-14 shrink-0" aria-label="내 정보 · 프로필 사진">
			<span class="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full text-[19px] font-extrabold text-bg shadow-[0_0_0_2px_#0a0b0e,0_0_0_3.5px_rgba(255,255,255,.12)] lg:text-[20px]" style:background={me.avatarBg}>
				{#if photo}
					<img src={photo} alt="" class="absolute inset-0 h-full w-full object-cover" />
				{:else}
					{me.initial}
				{/if}
			</span>
		</a>
		<div class="min-w-0 flex-1 {needsSettle ? 'lg:flex-none' : ''}">
			<p class="truncate text-[18px] font-extrabold tracking-[-0.02em] lg:text-[22px]">{me.name}</p>
			<p class="mt-0.5 truncate text-[13px] text-white/50 lg:mt-[3px] lg:text-[14px]">{me.handle} · 오늘도 좋은 하루예요</p>
		</div>
		<!-- PC — 정산 정보 배너는 프로필 오른쪽 남는 자리에(아래 카드들을 밀어내지 않게 · 2026-11-09) -->
		{#if needsSettle}<div class="hidden min-w-0 flex-1 lg:ml-6 lg:flex">{@render settleBanner()}</div>{/if}
	</div>

	<!-- 사업자 · 정산 정보(0085) — 미입력 · 다시 입력 필요면 배너(정산은 계산되고 지급만 보류). 모바일은 프로필 아래 한 줄 · PC 는 프로필 오른쪽(위 줄 snippet) -->
	{#if needsSettle}<div class="mt-4 lg:hidden">{@render settleBanner()}</div>{/if}

	<div class="mt-5 grid grid-cols-2 gap-x-2.5 gap-y-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-3.5">
		<div class="relative col-span-2 overflow-hidden rounded-3xl bg-panel p-5 lg:col-span-1 lg:px-7 lg:py-[26px]">
			<div class="pointer-events-none absolute -top-[70px] -right-[70px] h-60 w-60 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.4),rgba(21,22,26,0))] lg:-top-20 lg:h-[280px] lg:w-[280px]"></div>
			<a href="/settle" class="relative flex items-center gap-1 text-[12px] font-bold text-white/55 hover:text-fg lg:text-[13px]">다음 정산 예정{data.preview.settleAt ? ` · ${settleAtLabel(data.preview.settleAt)}` : ''}<Icon id="chev" size={13} sw={2.4} /></a>
			<p class="relative mt-1.5 text-[34px] font-extrabold tracking-[-0.04em] tabular-nums lg:mt-2 lg:text-[40px]">{won(data.preview.total.payout)}</p>
			<p class="relative mt-1 text-[11px] text-white/40 lg:text-[12px]">{data.preview.month ? `${monthLabel(data.preview.month)} ` : ''}배송 완료된 판매{data.preview.total.offset > 0 ? '에서 제조금액을 빼고 받을' : '에서 받을'} 예상 금액이에요</p>
			<div class="relative mt-3.5 flex gap-4 lg:mt-[18px] lg:gap-7">
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">이번 달 순매출</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px]">{won(sales.net)}</p></div>
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">주문</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px]">{sales.orders.toLocaleString('ko-KR')}건</p></div>
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">판매 수량</p><p class="mt-0.5 text-[15px] font-bold tabular-nums lg:mt-[3px] lg:text-[17px]">{sales.units.toLocaleString('ko-KR')}개</p></div>
				<div><p class="text-[11px] text-white/50 lg:text-[12px]">CS 비율</p><p class="mt-0.5 text-[15px] font-bold text-accent tabular-nums lg:mt-[3px] lg:text-[17px]">{csRateText(sales)}</p></div>
			</div>
		</div>
		<a href="/cs" class="flex flex-col gap-2.5 rounded-[20px] border border-accent/25 bg-accent/8 p-4 text-left transition-colors lg:justify-between lg:gap-3.5 lg:rounded-3xl lg:p-[22px] lg:hover:border-accent/55">
			<span class="flex items-center justify-between">
				<span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-bg lg:h-10 lg:w-10"><Icon id="cs" size={18} sw={2.2} class="lg:h-5 lg:w-5" /></span>
				<span class="text-[26px] font-extrabold tracking-[-0.04em] text-accent tabular-nums lg:text-[32px]">{csCount}</span>
			</span>
			<span>
				<span class="block text-[15px] font-bold lg:text-[16px]">처리 대기 CS</span>
				<span class="mt-0.5 block text-[12px] text-white/55 lg:mt-[3px] lg:text-[13px]">교환·환불 {data.claimWaiting} · 고객 문의 {data.inqWaiting}</span>
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
				{#each todayClaims as c (c.code)}
					{@const tm = CS_TYPE_META[c.kind]}
					<a href="/cs/{c.code}" class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-left transition-colors lg:flex-1 lg:gap-3.5 lg:rounded-[20px] lg:p-4 lg:hover:border-white/28">
						<Tile tile="slate" bg={c.product?.tile} iconId={c.product?.icon} thumbUrl={c.product?.thumbUrl} icon={36} class="h-12 w-12 rounded-[14px] lg:h-14 lg:w-14 lg:rounded-2xl" />
						<span class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
							<span class="flex items-center gap-1.5"><Badge cls={tm.cls}>{tm.label}</Badge><span class="text-[11px] text-white/45 lg:text-[12px]"><span class="hidden lg:inline">{c.code.toUpperCase()} · </span>{relativeTime(c.createdAt)}</span></span>
							<span class="truncate text-[14px] font-bold lg:text-[15px]">{c.name} × {c.qty}</span>
							<span class="truncate text-[12px] text-white/55 lg:text-[13px]">{c.buyerName} · {c.reason}</span>
						</span>
						{#if isUrgentPending({ status: 'pending', createdAt: c.createdAt })}
							<span class="hidden shrink-0 items-center gap-1.5 text-[12px] font-bold whitespace-nowrap text-accent lg:flex"><Icon id="clock" size={14} sw={2.2} />{dueText(c)}</span>
						{/if}
						<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
					</a>
				{/each}
				{#each todayInq as q (q.code)}
					<a href="/cs/inquiry/{q.code}" class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3.5 text-left transition-colors lg:flex-1 lg:gap-3.5 lg:rounded-[20px] lg:p-4 lg:hover:border-white/28">
						<Tile tile="slate" bg={q.product?.tile} iconId={q.product?.icon} thumbUrl={q.product?.thumbUrl} icon={36} class="h-12 w-12 rounded-[14px] lg:h-14 lg:w-14 lg:rounded-2xl" />
						<span class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
							<span class="flex items-center gap-1.5"><Badge cls={inqTypeCls(q.type)}>{q.type}</Badge><span class="text-[11px] text-white/45 lg:text-[12px]">{relativeTime(q.createdAt)}</span></span>
							<span class="truncate text-[14px] font-bold lg:text-[15px]">{q.product?.name ?? '상품'}</span>
							<span class="truncate text-[12px] text-white/55 lg:text-[13px]">{q.buyerName} · {q.question}</span>
						</span>
						<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
					</a>
				{/each}
				{#if !todayInq.length && !todayClaims.length}
					<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-white/50 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:rounded-[20px] lg:py-9">대기 중인 CS가 없어요. 수고했어요!</div>
				{/if}
			</div>
		</section>

		<section class="flex flex-col">
			<div class="mt-7 mb-3 flex items-baseline justify-between lg:mt-0 lg:mb-0">
				<h2 class="text-[17px] font-extrabold tracking-[-0.02em] lg:text-[20px]">최근 7일 판매</h2>
				<span class="hidden text-[14px] text-white/50 lg:inline">합계 <b class="font-bold text-fg tabular-nums">{weekTotal}건</b></span>
			</div>
			<div class="rounded-[20px] border border-white/8 bg-white/3 px-4 pt-[18px] pb-3.5 lg:mt-3.5 lg:flex lg:flex-1 lg:flex-col lg:rounded-3xl lg:px-5 lg:pt-[22px] lg:pb-[18px]">
				<div class="flex h-[88px] items-end gap-2 lg:h-auto lg:min-h-[140px] lg:flex-1 lg:gap-2.5" role="img" aria-label="최근 7일 주문 {bars.map((b) => `${b.day} ${b.value}건`).join(', ')}">
					{#each bars as b (b.date)}
						{@const top = b.top}
						<div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5 lg:gap-2">
							<span class="hidden text-[12px] font-bold tabular-nums lg:block {top ? 'text-accent' : 'text-white/45'}">{b.value}</span>
							<span class="w-full rounded-t-md rounded-b-[3px] transition-[height] duration-600 lg:rounded-t-lg lg:rounded-b-sm {top ? 'bg-accent' : 'bg-white/12'}" style:height="{Math.max(b.height, 2)}%"></span>
							<span class="text-[11px] font-semibold lg:text-[12px] {top ? 'text-accent' : 'text-white/45'}">{b.day}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</div>
</div>
