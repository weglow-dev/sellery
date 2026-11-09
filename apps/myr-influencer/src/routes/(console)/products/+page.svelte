<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { Product } from '$lib/data';
	import { STATUS_ACTION_DONE, opensReview, productMenu, type ProductMenuItem } from '$lib/product-draft';
	import { PRODUCT_STATUS_META, PRODUCT_TABS, filterProducts, isSoldOut, productTabCounts, showsStock, won, type ProductTab } from '$lib/rules';
	import { readParam, syncParam } from '$lib/url-state';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProductMenu from '$lib/components/ProductMenu.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 내 제품 — 로그인한 크리에이터의 실제 상품(+page.server.ts · 0071). 탭 전체 · 판매 중(일시중지 포함) · 심사 중(반려 포함) · 임시저장 · 종료.
	 *  [상품 등록] → 8단계 에디터(0073 저장). 상품을 누르면 메뉴(product-draft productMenu): 임시저장 이어서 작성 · 삭제 / 반려 고쳐서 다시 심사 요청 /
	 *  판매 중 일시중지 · 판매 종료 / 일시중지 다시 판매 · 판매 종료(종료 · 삭제는 확인). 심사 중 · 종료는 안내만. 재고는 읽기 전용(남은 재고 = 입고 − 판매).
	 *  모바일은 한 줄 목록, PC(lg~)는 32px 제목 + 2단 카드(누적 판매 수량까지).
	 *  판매 중 · 일시중지 상품은 "내용 수정" → 수정 심사(0074) — 심사 중이면 "수정 심사 중" 칩(메뉴에서 안내) · 반려면 "수정 반려" 칩 + "오늘 수정 반려 · N건 수정 필요" · 메뉴 "심사 결과 보기".
	 *  반려 상품(상품 심사)은 누르면 바로 "심사 결과"([id]/review) → 반려 내용 고치기. */
	let { data } = $props();
	// 보던 탭은 주소(?tab=)에 — 상품 상세 · 에디터에 갔다가 뒤로 오면 그대로
	let tab = $state<ProductTab>(readParam('tab', PRODUCT_TABS.map((t) => t.id), 'all'));
	$effect(() => syncParam('tab', tab, 'all'));
	const products = $derived(data.products);
	const tabs = $derived(productTabCounts(products));
	const list = $derived(filterProducts(products, tab));

	let menuFor = $state<Product | null>(null);
	let busy = $state(false);
	const menuItems = $derived(menuFor ? productMenu(menuFor.status, menuFor.revision?.state ?? null) : []);

	/** 반려 · 수정 반려는 바로 "심사 결과"(시안 · 수정 반려도 같게 2026-11-09) · 그 밖은 메뉴 */
	function open(p: Product) {
		if (opensReview(p.status, p.revision?.state ?? null)) goto(`/products/${encodeURIComponent(p.id)}/review`);
		else if (productMenu(p.status, p.revision?.state ?? null).length) menuFor = p;
		else if (p.status === 'review') app.showToast('운영팀이 심사하고 있어요. 승인되면 MYR Shop 에 열려요');
		else if (p.revision?.state === 'review') app.showToast('수정 내용을 운영팀이 심사하고 있어요. 승인 전까지 샵은 지금 내용으로 판매해요');
		else app.showToast(`${p.name} · ${PRODUCT_STATUS_META[p.status].label}`);
	}

	async function pick(it: ProductMenuItem) {
		const p = menuFor;
		if (!p || busy) return;
		if (it.kind === 'edit') {
			goto(`/products/new?id=${encodeURIComponent(p.id)}`);
			return;
		}
		if (it.kind === 'review') {
			goto(`/products/${encodeURIComponent(p.id)}/review`);
			return;
		}
		busy = true;
		try {
			const res = await fetch(`/api/products/${encodeURIComponent(p.id)}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: it.kind }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean } | null;
			app.showToast(r?.ok ? STATUS_ACTION_DONE[it.kind] : '바꾸지 못했어요. 목록을 새로 불러올게요');
			menuFor = null;
			await invalidateAll();
		} catch {
			app.showToast('바꾸지 못했어요. 인터넷 연결을 확인해주세요');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">내 제품</h1>
		<a href="/products/new" class="flex h-10 items-center gap-1.5 rounded-xl bg-accent pr-3.5 pl-2.5 text-[13px] font-extrabold text-bg transition-colors lg:h-[46px] lg:rounded-[14px] lg:pr-[18px] lg:pl-3.5 lg:text-[14px] lg:hover:bg-[#ff8f5c]">
			<Icon id="plus" size={16} sw={2.6} />상품 등록
		</a>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="제품 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
			{#each list as p (p.id)}
				{@const m = PRODUCT_STATUS_META[p.status]}
				<button type="button" onclick={() => open(p)} class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 text-left transition-colors lg:gap-4 lg:rounded-[20px] lg:p-4 lg:hover:border-white/30">
					<Tile tile={p.tile} thumbUrl={p.thumbUrl} bg={p.bg} iconId={p.iconId} icon={36} iconCls="lg:h-11 lg:w-11" class="h-16 w-16 rounded-[14px] lg:h-20 lg:w-20 lg:rounded-[18px] {p.status === 'ended' || p.status === 'paused' ? 'opacity-50' : ''}" />
					<span class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
						<span class="flex min-w-0 items-center gap-1.5"><Badge cls={m.cls}>{m.label}</Badge>{#if isSoldOut(p)}<Badge cls="bg-[#ff5c8a]/18 text-[#ff7aa2]">품절</Badge>{/if}{#if p.revision}<Badge cls={PRODUCT_STATUS_META[p.revision.state].cls}>{p.revision.state === 'review' ? '수정 심사 중' : '수정 반려'}</Badge>{/if}<span class="truncate text-[11px] text-white/45 lg:text-[12px]">{p.revision ? p.revision.meta : p.meta}</span></span>
						<span class="text-[14px] leading-[1.3] font-bold lg:text-[16px]">{p.name}</span>
						<span class="text-[12px] text-white/55 lg:text-[13px]">
							{p.price ? won(p.price) : '가격 미정'} · 재고 {showsStock(p.status) ? `${p.stock.toLocaleString('ko-KR')}개` : '—'}<span class="hidden lg:inline">{' · '}누적 판매 {p.sold ? `${p.sold.toLocaleString('ko-KR')}개` : '—'}</span>
						</span>
					</span>
					<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
				</button>
			{:else}
				{#if products.length === 0}
					<!-- 아직 상품이 하나도 없는 크리에이터(가입 직후) -->
					<div class="flex flex-col items-center py-[60px] text-center lg:col-span-2 lg:py-20">
						<span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6 text-white/60"><Icon id="box" size={26} /></span>
						<p class="mt-4 text-[16px] font-bold">아직 등록한 제품이 없어요</p>
						<p class="mt-1.5 text-[13px] leading-[1.55] text-white/50">레시피로 만든 제품을 등록하면 운영팀 심사 뒤 MYR Shop 에 올라가요.</p>
						<a href="/products/new" class="mt-5 flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-extrabold text-bg lg:hover:bg-[#ff8f5c]"><Icon id="plus" size={16} sw={2.6} />첫 제품 등록하기</a>
					</div>
				{:else}
					<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">해당하는 제품이 없어요</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

{#if menuFor}
	<ProductMenu product={menuFor} items={menuItems} {busy} onpick={pick} onclose={() => (menuFor = null)} />
{/if}
