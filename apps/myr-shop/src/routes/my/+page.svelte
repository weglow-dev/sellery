<script lang="ts">
	import { won } from '$lib/data';
	import { displayCode, shortDate, statusLabel } from '@sellery/myr-core/order-view';
	import { shop } from '$lib/state.svelte';
	import MyInquiries from '$lib/components/MyInquiries.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 마이 — 프로필 카드(세션 · 로그아웃) · 주문/찜 수 · 최근 주문(서버 myr_orders · 0060) · 찜한 레시피 · 메뉴.
	 *  로그인은 레이아웃 data.user(카카오 · S3). 비로그인이면 로그인 CTA + 비회원 주문 조회 링크. 포인트는 1차 범위 밖(docs/myr.md §9-12)이라 칸을 두지 않는다.
	 *  PC(lg): 왼쪽 sticky 프로필+메뉴 · 오른쪽 주문/찜 */
	let { data } = $props();
	const user = $derived(data.user);
	const orders = $derived(data.orders);
	const name = $derived(user?.name ?? shop.buyer.name.trim());
	const LANDING = 'https://sellery.life/influencer/oem';
	const menu = [
		{ name: '비회원 주문 조회', href: '/orders/lookup' },
		{ name: '배송지 관리', href: '/checkout' },
		{ name: '고객센터', href: '/' },
		{ name: '내 제품 만들기 (MYR 제조의뢰)', href: LANDING, external: true }
	];
	const tone: Record<string, string> = { accent: 'bg-accent/12 text-accent', muted: 'bg-white/8 text-white/55', danger: 'bg-[#ff6b6b]/12 text-[#ff6b6b]', ok: 'bg-[#4ade80]/12 text-[#4ade80]' };
</script>

<svelte:head><title>마이페이지 — MYR Shop</title></svelte:head>

<div class="animate-up-in px-5 pb-5 lg:mx-auto lg:grid lg:max-w-[1240px] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-10 lg:pt-8 lg:pb-20">
	<div class="flex h-[60px] items-center justify-between lg:hidden">
		<span class="text-[16px] font-bold">마이페이지</span>
		<button type="button" aria-label="설정" class="flex h-11 w-11 items-center justify-center text-white/70">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
		</button>
	</div>

	<!-- 프로필 + 메뉴 (PC 는 왼쪽 sticky) -->
	<aside class="contents lg:sticky lg:top-[104px] lg:flex lg:flex-col lg:gap-3">
		<div class="mt-2 flex items-center gap-3.5 rounded-3xl border border-white/7 bg-panel p-5 lg:mt-0 lg:flex-col lg:items-start lg:gap-3.5 lg:p-6">
			{#if user?.avatar}
				<img src={user.avatar} alt="" class="h-[52px] w-[52px] rounded-full object-cover lg:h-[60px] lg:w-[60px]" />
			{:else}
				<span class="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-[18px] font-extrabold text-bg lg:h-[60px] lg:w-[60px] lg:text-[22px]" aria-hidden="true">{(name || 'M')[0].toUpperCase()}</span>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-[17px] font-extrabold lg:text-[19px]">{name || 'MYR 멤버'}</p>
				{#if user}
					<p class="mt-[3px] truncate text-[13px] text-fg-faint lg:mt-1">{user.email ?? shop.buyer.phone ?? '카카오 계정'}</p>
				{:else}
					<a href="/login?next=/my" class="mt-1 inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-[12.5px] font-extrabold text-bg">카카오로 로그인</a>
				{/if}
			</div>
			{#if user}
				<form method="post" action="/auth/signout" class="shrink-0 lg:self-end">
					<button type="submit" class="h-8 rounded-[10px] border border-white/12 px-3 text-[12px] font-bold text-fg-faint hover:text-fg">로그아웃</button>
				</form>
			{/if}
			<div class="hidden w-full grid-cols-2 gap-2 border-t border-white/7 pt-1.5 lg:grid">
				<div><p class="mt-2 text-[20px] font-extrabold text-accent">{orders.length}</p><p class="mt-0.5 text-[12px] text-fg-faint">주문</p></div>
				<div><p class="mt-2 text-[20px] font-extrabold">{shop.likes.length}</p><p class="mt-0.5 text-[12px] text-fg-faint">찜</p></div>
			</div>
		</div>
		<div class="mt-2.5 grid grid-cols-2 gap-2 lg:hidden">
			<div class="rounded-2xl border border-white/8 bg-white/4 px-3 py-3.5"><p class="text-[22px] font-extrabold tracking-[-.03em] text-accent">{orders.length}</p><p class="mt-1 text-[12px] text-fg-soft">주문</p></div>
			<div class="rounded-2xl border border-white/8 bg-white/4 px-3 py-3.5"><p class="text-[22px] font-extrabold tracking-[-.03em]">{shop.likes.length}</p><p class="mt-1 text-[12px] text-fg-soft">찜</p></div>
		</div>
		<div class="order-last mt-[26px] flex flex-col overflow-hidden rounded-[18px] border border-white/8 lg:order-none lg:mt-0 lg:rounded-[20px]">
			{#each menu as m, i (m.name)}
				<a
					href={m.href}
					target={m.external ? '_blank' : undefined}
					rel={m.external ? 'noopener' : undefined}
					class="flex items-center justify-between bg-white/2 p-4 text-left text-[14px] font-semibold text-fg transition-colors lg:px-[18px] lg:hover:bg-white/5 {i ? 'border-t border-white/7' : ''}"
				>
					<span>{m.name}</span>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
				</a>
			{/each}
		</div>
	</aside>

	<div class="contents lg:block">
		<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">마이페이지</h1>

		<h3 class="mt-[26px] mb-2.5 text-[15px] font-extrabold lg:mt-7 lg:mb-3 lg:text-[17px]">최근 주문</h3>
		{#if !user}
			<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] leading-[1.6] text-fg-faint lg:rounded-[20px] lg:py-10">
				로그인하면 주문을 여기서 볼 수 있어요<br />비회원으로 주문했다면 <a href="/orders/lookup" class="font-bold text-accent">주문 조회</a>에서 주문번호와 연락처로 확인해요
			</div>
		{:else if data.ordersError}
			<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-fg-faint lg:rounded-[20px] lg:py-10">주문을 불러오지 못했어요 — 잠시 후 다시 열어주세요</div>
		{:else if orders.length === 0}
			<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-fg-faint lg:rounded-[20px] lg:py-10">아직 주문이 없어요</div>
		{/if}
		<div class="flex flex-col gap-2.5">
			{#each orders as o (o.id)}
				{@const label = statusLabel(o)}
				<a href="/orders/{o.code}" class="block rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 text-fg transition-colors lg:flex lg:items-center lg:gap-4 lg:rounded-[20px] lg:px-5 lg:py-4 lg:hover:border-white/25">
					<div class="flex items-center justify-between lg:hidden"><span class="font-mono text-[12px] text-fg-faint">{displayCode(o.code)}</span><span class="rounded-full px-2 py-1 text-[11px] font-bold {tone[label.tone]}">{label.text}</span></div>
					<div class="mt-2.5 flex items-center gap-2.5 lg:contents">
						<div class="flex gap-1.5">
							{#each o.items.slice(0, 2) as l (l.id)}
								<Tile tile={l.tile} ic={l.ic} thumbUrl={l.thumbUrl} icon={22} class="h-10 w-10 rounded-xl lg:h-12 lg:w-12 lg:rounded-[14px]" />
							{/each}
						</div>
						<div class="min-w-0 flex-1"><p class="truncate text-[14px] font-bold lg:text-[15px]">{o.orderName}</p><p class="mt-0.5 text-[12px] text-fg-faint"><span class="hidden font-mono lg:inline">{displayCode(o.code)} · </span>{shortDate(o.createdAt)}</p></div>
						<span class="hidden rounded-full px-2.5 py-[5px] text-[12px] font-bold lg:inline {tone[label.tone]}">{label.text}</span>
						<span class="text-[14px] font-extrabold lg:min-w-[90px] lg:text-right lg:text-[16px]">{won(o.amount)}</span>
					</div>
				</a>
			{/each}
		</div>

		{#if user && data.inquiries.length}
			<h3 class="mt-[26px] mb-2.5 text-[15px] font-extrabold lg:mt-8 lg:mb-3 lg:text-[17px]">내 문의 <span class="ml-0.5 text-[13px] font-semibold text-fg-faint">{data.inquiries.length}</span></h3>
			<MyInquiries items={data.inquiries} />
		{/if}

		<h3 class="mt-[26px] mb-2.5 text-[15px] font-extrabold lg:mt-8 lg:mb-3 lg:text-[17px]">찜한 레시피</h3>
		{#if shop.ready && shop.likes.length === 0}
			<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-fg-faint lg:rounded-[20px] lg:py-10">하트를 눌러 레시피를 저장해보세요</div>
		{/if}
		<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3">
			{#each shop.likes as p (p.code)}
				<a href="/p/{p.code}" class="flex items-center gap-2.5 rounded-[18px] border border-white/8 bg-white/3 p-3 text-left text-fg transition-colors lg:gap-3 lg:hover:border-white/25">
					<Tile tile={p.tile} ic={p.ic} thumbUrl={p.thumbUrl} alt={p.name} icon={26} class="h-11 w-11 rounded-xl lg:h-14 lg:w-14 lg:rounded-[14px]" />
					<span class="flex min-w-0 flex-col gap-0.5"><span class="truncate text-[13px] font-bold lg:text-[14px]">{p.name}</span><span class="text-[12px] text-fg-faint lg:text-[13px]">{won(p.price)}</span></span>
				</a>
			{/each}
		</div>
	</div>
</div>
