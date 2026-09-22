<script lang="ts">
	/**
	 * 고객 문의함 — 프로토타입 데모 demo-cs/+page.svelte(OPEN 우선 정렬 · 칩 M · 답변/종료 버튼) 의 목록 판. 답변 · 종료는 상세(`/cs/[code]`)에서.
	 * 행: 상품 아이콘 · 상품명 · 유형 칩 · 상태 칩 / 주문번호(매칭 표시) · 고객명(회원 표시) · 인플루언서 · 시간 / 마지막 메시지 미리보기.
	 */
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>고객 문의 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>고객 문의</h2>
	{#if data.open}<span class="badge">{data.open}</span>{/if}
	<span class="meta">구매 고객이 남긴 문의가 바로 여기로 와요 — 답변하면 고객 문의 화면에 표시됩니다</span>
	<a href={data.ordersPath} class="btn ghost sm" style="margin-left:auto">주문 · 발주 →</a>
</div>

<p class="meta" style="margin:0 4px 10px">배송·교환·반품은 브랜드가 직접, 결제·정산 문제는 셀러리 운영팀이 함께 처리합니다. 발송된 주문의 교환·반품은 회수 뒤 운영팀이 취소 처리해요.</p>

<nav class="cats console-filters" aria-label="문의 상태 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {(data.status ?? '') === f.key ? 'on' : ''}" aria-current={(data.status ?? '') === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
</nav>

<div class="listcard console-rows console-cs">
	{#each data.rows as x (x.code)}
		{@const p = x.campaign.product}
		<a href={x.href} class="rowitem console-cs-row">
			{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={38} />{/if}
			<div class="grow">
				<div class="nm">
					{p?.name ?? '—'}
					<span class="chip">{x.type}</span>
					<StatusChip tone={x.chip.tone}>{x.chip.label}</StatusChip>
				</div>
				<div class="sub">
					<span class="console-mono">{x.code.toUpperCase()}</span>
					· 주문 {#if x.order_code}<span class="console-mono">{x.order_code.toUpperCase()}</span>{#if x.order_matched}{' '}<span class="chip plat" title="같은 캠페인의 주문으로 확인됨">매칭</span>{:else}{' '}<span class="console-danger">(미확인)</span>{/if}{:else}—{/if}
					· {x.buyer_name}{x.is_member ? ' (회원)' : ''}
					{#if x.campaign.seller}{' '}· {x.campaign.seller.handle}{/if}
					· {md(x.last_message_at)} · {x.message_count}개
				</div>
				{#if x.last_preview}<div class="console-cs-preview">{x.last_preview}</div>{/if}
			</div>
			<div class="rowacts"><span class="btn {x.status === 'OPEN' ? 'pri' : 'ghost'} sm">{x.status === 'OPEN' ? '답변하기' : '보기'}</span></div>
		</a>
	{:else}
		<div class="empty" style="padding:24px">
			{#if data.status}이 상태의 문의가 없어요{:else}접수된 고객 문의가 없습니다<div class="meta" style="margin-top:8px">고객이 판매 페이지 · 내 주문에서 "판매자에게 문의" 를 남기면 여기에 쌓여요.</div>{/if}
		</div>
	{/each}
</div>
