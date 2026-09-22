<script lang="ts">
	/**
	 * 고객 문의 (열람) — 브랜드 콘솔 `/cs` 목록과 같은 행(상품 · 유형 · 상태 / 코드 · 주문 · 고객 · 인플루언서 · 브랜드 · 시간 / 미리보기). 답변 버튼 없음 — 브랜드가 답한다.
	 */
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>고객 문의 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>고객 문의</h2>
	{#if data.open}<span class="badge">{data.open}</span>{/if}
	<span class="meta">문의는 브랜드로 바로 배정돼요 — 관리자는 처리 현황만 봅니다</span>
	<a href={data.ordersPath} class="btn ghost sm" style="margin-left:auto">주문 →</a>
</div>

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
					{#if x.campaign.brand}{' '}· {x.campaign.brand.name}{/if}
					· {md(x.last_message_at)} · {x.message_count}개
				</div>
				{#if x.last_preview}<div class="console-cs-preview">{x.last_preview}</div>{/if}
			</div>
			<div class="rowacts"><span class="btn ghost sm">보기</span></div>
		</a>
	{:else}
		<div class="empty" style="padding:24px">{data.status ? '이 상태의 문의가 없어요' : '접수된 고객 문의가 없습니다'}</div>
	{/each}
</div>
