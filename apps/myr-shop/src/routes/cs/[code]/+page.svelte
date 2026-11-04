<script lang="ts">
	/** 고객 문의 스레드(읽기 전용) — 머리(상품 · 크리에이터 · 유형 · 상태 칩) · 주문 요약(소유 증명된 주문 · 이 상품 줄) · 말풍선(내 글 오른쪽 · 크리에이터/운영팀 왼쪽). 이어 묻는 폼은 없고, 더 궁금하면 주문 상세·상품 페이지의 문의 시트로 새 문의.
	 *  크리에이터가 답변하면 notifyCsReplied(이메일)도 가지만, 이메일이 없는 고객(비회원 미입력 · 카카오)은 이 화면이 정본. */
	import { won } from '$lib/data';
	import { csSenderLabel } from '@sellery/myr-core/cs-rules';
	import { shortDate } from '@sellery/myr-core/order-view';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import Tile from '$lib/components/Tile.svelte';

	let { data } = $props();
	const c = $derived(data.conversation);
	const closed = $derived(c.status === 'CLOSED');
	// 새 문의는 같은 문의 시트(CsSheet)로 — 주문이 연결돼 있으면 그 주문 상세(회원/비회원), 아니면 상품 페이지
	const newAskHref = $derived(c.order ? (c.isMember ? `/orders/${c.order.code}` : `/orders/g/${c.order.code}`) : c.product ? `/p/${c.product.code}` : null);
	const tone: Record<string, string> = { accent: 'bg-accent/12 text-accent', ok: 'bg-[#4ade80]/12 text-[#4ade80]', muted: 'bg-white/8 text-white/55' };
	const fmtTime = (iso: string) => `${shortDate(iso)} ${new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}`;
</script>

<svelte:head>
	<title>문의 {c.code.toUpperCase()} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex animate-slide-in flex-col lg:mx-auto lg:max-w-[720px] lg:px-10 lg:pt-12 lg:pb-20">
	<BackHeader title="문의 {c.code.toUpperCase()}" home={!data.signedIn} />
	<div class="px-5 pt-2 pb-10 lg:px-0 lg:pt-0">
		<div class="hidden items-baseline justify-between lg:flex">
			<h1 class="text-[28px] font-extrabold tracking-[-.03em]">문의 <span class="font-mono text-[20px] text-fg-faint">{c.code.toUpperCase()}</span></h1>
			{#if data.signedIn}<a href="/my" class="text-[13px] font-bold text-accent">마이페이지</a>{/if}
		</div>

		{#if data.msg}
			<p role="status" class="mt-3 rounded-[14px] border px-4 py-3 text-[13px] leading-[1.55] {data.msg.tone === 'ok' ? 'border-accent/30 bg-accent/8 text-white/85' : 'border-[#ff6b6b]/30 bg-[#ff6b6b]/8 text-white/85'}">{data.msg.text}</p>
		{/if}

		<div class="mt-3 rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 lg:mt-5">
			<div class="flex items-center gap-3">
				{#if c.product}<a href="/p/{c.product.code}" aria-label={c.product.name}><Tile tile={c.product.tile ?? ''} ic={c.product.icon} thumbUrl={c.product.thumbUrl} alt="" icon={24} class="h-12 w-12 rounded-xl" /></a>{/if}
				<div class="min-w-0 flex-1">
					<p class="text-[11px] font-bold text-accent">{data.sellerName}</p>
					<p class="truncate text-[14px] font-bold">{c.product?.name ?? '문의'} <span class="ml-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold text-white/70">{c.type}</span></p>
					<p class="mt-0.5 text-[12px] text-fg-faint">접수 {fmtTime(c.createdAt)}{#if c.orderCode} · 주문 <span class="font-mono">{c.orderCode.toUpperCase()}</span>{#if !c.order} (미확인){/if}{/if}</p>
				</div>
				<span class="shrink-0 rounded-full px-2.5 py-[5px] text-[12px] font-bold {tone[data.chip.tone]}">{data.chip.label}</span>
			</div>
			{#if c.order?.item}
				<p class="mt-2.5 border-t border-white/8 pt-2.5 text-[12.5px] text-white/70">주문 {c.order.code.toUpperCase()} · {c.order.item.name}{c.order.item.option ? ` · ${c.order.item.option}` : ''} × {c.order.item.qty} · {won(c.order.item.amount)}{#if c.order.trackingNo} · {c.order.courier ?? ''} {c.order.trackingNo}{/if}</p>
			{/if}
		</div>

		<section id="thread" aria-label="문의 스레드" class="mt-3 rounded-[18px] border border-white/8 bg-panel p-4 lg:p-5">
			<div class="flex flex-col gap-3">
				{#each data.messages as m (m.id)}
					<div class="flex flex-col {m.sender === 'customer' ? 'items-end' : 'items-start'}">
						<p class="mb-1 text-[11px] font-bold {m.sender === 'customer' ? 'text-fg-faint' : 'text-accent'}">{csSenderLabel(m.sender, data.sellerName)}</p>
						<p class="max-w-[85%] rounded-[16px] px-4 py-3 text-[14px] leading-[1.6] whitespace-pre-wrap break-words {m.sender === 'customer' ? 'rounded-tr-[4px] bg-accent text-bg' : 'rounded-tl-[4px] bg-white/6 text-fg'}">{m.body}</p>
						<p class="mt-1 text-[11px] text-fg-faint">{fmtTime(m.createdAt)}</p>
					</div>
				{:else}
					<p class="text-center text-[13px] text-fg-faint">메시지가 없습니다</p>
				{/each}
				{#if c.status === 'OPEN'}<p class="text-center text-[12px] text-fg-faint">크리에이터가 답변하면 여기서 확인할 수 있어요</p>{/if}
				{#if closed}<p class="text-center text-[12px] text-fg-faint">처리 종료{c.closedAt ? ` · ${fmtTime(c.closedAt)}` : ''}</p>{/if}
			</div>
			{#if c.status !== 'OPEN'}
				<p class="mt-4 border-t border-white/8 pt-4 text-[13px] leading-[1.55] text-white/70">더 궁금한 점은 {#if newAskHref}<a href={newAskHref} class="font-bold text-accent">{c.order ? '주문 상세' : '상품 페이지'}</a>의 [문의]{:else}주문 상세나 상품 페이지의 [문의]{/if}로 새로 남겨주세요.</p>
			{/if}
		</section>
	</div>
</div>
