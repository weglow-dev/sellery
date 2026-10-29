<script lang="ts">
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 마이 — 프로필 카드 · 주문/찜 수 · 최근 주문 · 찜한 레시피 · 메뉴.
	 *  로그인은 M4(카카오 · 비회원) — 지금은 결제 때 적은 이름·연락처를 보여준다. 포인트는 1차 범위 밖(docs/myr.md §9-12)이라 칸을 두지 않는다. */
	const name = $derived(shop.buyer.name.trim());
	const LANDING = 'https://sellery.life/influencer/oem';
	const menu = [
		{ name: '배송지 관리', href: '/checkout' },
		{ name: '고객센터', href: '/' },
		{ name: '내 제품 만들기 (MYR 제조의뢰)', href: LANDING, external: true }
	];
	const when = (iso: string) => {
		const d = new Date(iso);
		return `${d.getMonth() + 1}월 ${d.getDate()}일`;
	};
</script>

<svelte:head><title>마이페이지 — MYR Shop</title></svelte:head>

<div class="animate-up-in px-5 pb-[110px]">
	<div class="flex h-[60px] items-center justify-between">
		<span class="text-[16px] font-bold">마이페이지</span>
		<button type="button" aria-label="설정" class="flex h-11 w-11 items-center justify-center text-white/70">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
		</button>
	</div>

	<div class="mt-2 flex items-center gap-3.5 rounded-3xl border border-white/7 bg-panel p-5">
		<span class="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-[18px] font-extrabold text-bg" aria-hidden="true">{(name || 'M')[0].toUpperCase()}</span>
		<div class="min-w-0 flex-1"><p class="text-[17px] font-extrabold">{name || 'MYR 멤버'}</p><p class="mt-[3px] text-[13px] text-fg-faint">{shop.buyer.phone || '로그인하고 혜택을 받아보세요'}</p></div>
	</div>

	<div class="mt-2.5 grid grid-cols-2 gap-2">
		<div class="rounded-2xl border border-white/8 bg-white/4 px-3 py-3.5"><p class="text-[22px] font-extrabold tracking-[-.03em] text-accent">{shop.orders.length}</p><p class="mt-1 text-[12px] text-fg-soft">주문</p></div>
		<div class="rounded-2xl border border-white/8 bg-white/4 px-3 py-3.5"><p class="text-[22px] font-extrabold tracking-[-.03em]">{shop.likes.length}</p><p class="mt-1 text-[12px] text-fg-soft">찜</p></div>
	</div>

	<h3 class="mt-[26px] mb-2.5 text-[15px] font-extrabold">최근 주문</h3>
	{#if shop.ready && shop.orders.length === 0}
		<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-fg-faint">아직 주문이 없어요</div>
	{/if}
	<div class="flex flex-col gap-2.5">
		{#each shop.orders as o (o.no)}
			<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5">
				<div class="flex items-center justify-between"><span class="text-[12px] text-fg-faint">{o.no}</span><span class="rounded-full bg-accent/12 px-2 py-1 text-[11px] font-bold text-accent">배송 준비중</span></div>
				<div class="mt-2.5 flex items-center gap-2.5">
					<div class="flex gap-1.5">
						{#each o.lines.slice(0, 2) as l (l.id)}
							<Tile tile={l.tile} ic={l.ic} icon={22} class="h-10 w-10 rounded-xl" />
						{/each}
					</div>
					<div class="min-w-0 flex-1"><p class="truncate text-[14px] font-bold">{o.lines[0].name}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</p><p class="mt-0.5 text-[12px] text-fg-faint">{when(o.at)}</p></div>
					<span class="text-[14px] font-extrabold">{won(o.total)}</span>
				</div>
			</div>
		{/each}
	</div>

	<h3 class="mt-[26px] mb-2.5 text-[15px] font-extrabold">찜한 레시피</h3>
	{#if shop.ready && shop.likedProducts.length === 0}
		<div class="rounded-[18px] border border-dashed border-white/14 px-4 py-7 text-center text-[14px] text-fg-faint">하트를 눌러 레시피를 저장해보세요</div>
	{/if}
	<div class="grid grid-cols-2 gap-2.5">
		{#each shop.likedProducts as p (p.id)}
			<a href="/p/{p.code}" class="flex items-center gap-2.5 rounded-[18px] border border-white/8 bg-white/3 p-3 text-left text-fg">
				<Tile tile={p.tile} ic={p.ic} icon={26} class="h-11 w-11 rounded-xl" />
				<span class="flex min-w-0 flex-col gap-0.5"><span class="truncate text-[13px] font-bold">{p.name}</span><span class="text-[12px] text-fg-faint">{won(p.price)}</span></span>
			</a>
		{/each}
	</div>

	<div class="mt-[26px] flex flex-col overflow-hidden rounded-[18px] border border-white/8">
		{#each menu as m, i (m.name)}
			<a
				href={m.href}
				target={m.external ? '_blank' : undefined}
				rel={m.external ? 'noopener' : undefined}
				class="flex items-center justify-between bg-white/2 p-4 text-left text-[14px] font-semibold text-fg {i ? 'border-t border-white/7' : ''}"
			>
				<span>{m.name}</span>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</a>
		{/each}
	</div>
</div>
