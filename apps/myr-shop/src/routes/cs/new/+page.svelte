<script lang="ts">
	/** 크리에이터에게 문의 — 머리(상품 · 크리에이터) · 안내 · 폼(이름 · 유형 · 주문번호(선택) · 내용) → `?/open`. 실패한 제출은 form(fail 400/429)으로 값 유지 · 필드 강조. 비회원도 접수 가능 — 답변은 접수 뒤 열리는 문의 화면(쿠키 90일)과 이메일(있으면). */
	import { enhance } from '$app/forms';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import Tile from '$lib/components/Tile.svelte';

	let { data, form } = $props();
	let submitting = $state(false);
	const v = (k: string, d = '') => form?.values?.[k] ?? d;
	const border = (k: string) => (form?.field === k ? 'border-[#ff6b6b]' : 'border-white/10');
	const inputCls = 'h-[52px] w-full rounded-[14px] border-[1.5px] bg-white/4 px-4 text-[15px] text-fg outline-none placeholder:text-fg-faint focus:border-accent focus:bg-accent/6 disabled:opacity-50';
	const backHref = $derived(`/p/${data.product.code}`);
</script>

<svelte:head>
	<title>크리에이터에게 문의 — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex animate-slide-in flex-col lg:mx-auto lg:max-w-[560px] lg:px-10 lg:pt-12 lg:pb-20">
	<BackHeader title="문의하기" />
	<div class="px-5 pt-2 pb-10 lg:px-0 lg:pt-0">
		<h1 class="hidden text-[28px] font-extrabold tracking-[-.03em] lg:block">크리에이터에게 문의</h1>
		<div class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 lg:mt-5">
			<Tile tile={data.product.tile} ic={data.product.icon} thumbUrl={data.product.thumbUrl} alt="" icon={24} class="h-12 w-12 rounded-xl" />
			<div class="min-w-0 flex-1">
				<p class="text-[11px] font-bold text-accent">{data.creator.name}</p>
				<p class="truncate text-[14px] font-bold">{data.product.name}</p>
			</div>
		</div>
		<p class="mt-3 rounded-[14px] bg-accent/8 px-4 py-3 text-[13px] leading-[1.6] text-white/80">이 문의는 <b class="text-fg">{data.creator.name}</b>님에게 바로 전달돼요. 배송·교환·반품은 크리에이터가 MYR 물류센터와 함께 처리하고, 결제 문제는 MYR 운영팀이 같이 확인해요.</p>

		<form method="post" action="?product={encodeURIComponent(data.product.code)}&/open" class="mt-5 flex flex-col gap-4" use:enhance={() => { submitting = true; return async ({ update }) => { await update(); submitting = false; }; }}>
			<input type="hidden" name="product" value={data.product.code} />
			{#if form?.message && !form.field}<p role="alert" class="rounded-[14px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-3.5 py-2.5 text-[13px] leading-[1.5] text-white/85">{form.message}</p>{/if}
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-bold text-fg-soft">이름 <span class="font-normal text-fg-faint">(선택)</span></span>
				<input name="buyer_name" value={v('buyer_name', data.prefill.buyer_name)} maxlength={data.nameMax} placeholder="답변에 쓸 이름" autocomplete="name" disabled={submitting} class="{inputCls} {border('buyer_name')}" />
				{#if form?.field === 'buyer_name'}<p class="mt-1 text-[12px] text-[#ff6b6b]">{form.message}</p>{/if}
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-bold text-fg-soft">문의 유형</span>
				<select name="type" required disabled={submitting} class="{inputCls} {border('type')} {v('type') ? '' : 'text-fg-faint'}">
					<option value="" disabled selected={!v('type')}>선택하세요</option>
					{#each data.types as t (t)}<option value={t} selected={v('type') === t}>{t}</option>{/each}
				</select>
				{#if form?.field === 'type'}<p class="mt-1 text-[12px] text-[#ff6b6b]">{form.message}</p>{/if}
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-bold text-fg-soft">주문번호 <span class="font-normal text-fg-faint">(선택 · 예: MYR1001)</span></span>
				<input name="order_code" value={v('order_code', data.prefill.order_code)} maxlength="32" placeholder="주문 상세에서 확인" autocomplete="off" disabled={submitting} class="{inputCls} {border('order_code')} font-mono uppercase" />
				<p class="mt-1 text-[12px] leading-[1.5] text-fg-faint">주문번호를 남기면 크리에이터가 바로 확인할 수 있어요. 본인 주문으로 확인될 때만 연결돼요.</p>
				{#if form?.field === 'order_code'}<p class="mt-1 text-[12px] text-[#ff6b6b]">{form.message}</p>{/if}
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-bold text-fg-soft">문의 내용 <span class="font-normal text-fg-faint">({data.bodyMax}자까지)</span></span>
				<textarea name="body" rows="6" maxlength={data.bodyMax} required placeholder="예: 배송이 언제 출발하나요? / 옵션을 바꾸고 싶어요" disabled={submitting} class="{inputCls} {border('body')} h-auto resize-none py-3.5 leading-[1.55]">{v('body')}</textarea>
				<p class="mt-1 text-[12px] leading-[1.5] text-fg-faint">카드 번호 같은 민감한 정보는 적지 마세요. 답변은 문의 화면{#if !data.signedIn}(비회원은 이 기기에서 90일간 열려요){/if}과 이메일로 알려드려요.</p>
				{#if form?.field === 'body'}<p class="mt-1 text-[12px] text-[#ff6b6b]">{form.message}</p>{/if}
			</label>
			<div class="mt-1 flex gap-2">
				<a href={backHref} class="flex h-12 flex-1 items-center justify-center rounded-[14px] border border-white/14 text-[14px] font-bold text-fg">취소</a>
				<button type="submit" disabled={submitting} class="flex h-12 flex-[2] items-center justify-center rounded-[14px] bg-accent text-[14px] font-extrabold text-bg transition-opacity disabled:opacity-60">{submitting ? '보내는 중…' : '문의 보내기'}</button>
			</div>
		</form>
	</div>
</div>
