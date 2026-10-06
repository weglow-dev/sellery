<script lang="ts">
	/**
	 * 셀러리 샵 — 프로토타입 `(demo)/shop` + `packages/ui/views/Shop.svelte` 를 콘솔 화면으로.
	 * 데모 화면은 이 PR 에서 삭제했다(실서비스가 `/shop` 을 가져감).
	 *   자동 차감 아이템(제안권 · 레퍼런스 열람권 · 데이터 확인)은 구매 버튼 없이 "사용 시 자동 차감" 으로만 보인다.
	 *   상단: 내 셀러리 · 획득 규칙 → 아이템 카드 → 셀러리 내역 8건.
	 *   아이템 버튼은 `shopButton()` 분기: 자동 차감 · 보유 중(남은 일수) · 구매 · 준비 중.
	 *
	 * **충전 카드를 가져오지 않았다** — 유상 충전 미도입(`points-policy.md` §0). 프로토타입에는
	 *   "충전 (시뮬 결제)" 카드가 있지만 실서비스에서는 🥬 를 돈으로 살 수 없다. 대신 어떻게 쌓이는지 적는다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import {
		SHOP_EARN_NOTE,
		SHOP_SUB,
		celeryWorthLine,
		earnRuleLine,
		ledgerLabel,
		priceLabel,
		shopButton
	} from '@sellery/db/shop/shop-rules';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.shop);
</script>

<svelte:head>
	<title>셀러리 샵 — 셀러리</title>
</svelte:head>

<div class="console-head">
	<h2>셀러리 샵</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">{SHOP_SUB} · {celeryWorthLine()}</p>

{#if data.notice}
	<p class={`notice ${data.notice.tone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.notice.text}</p>
{/if}

{#if data.failed}
	<p class="notice danger" role="status">샵을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if s}
	<div class="mini-stats console-totals" style="margin-top:0">
		<div>
			<span class="ms-l">내 셀러리</span>
			<span class="ms-v">🥬 {s.balance}</span>
			<span class="ms-s">무상 지급분</span>
		</div>
		<div>
			<span class="ms-l">획득 규칙</span>
			<span class="ms-v" style="font-size:17px">{earnRuleLine()}</span>
			<span class="ms-s"><a href={data.salesPath} style="text-decoration:underline">확정 매출</a> 기준</span>
		</div>
	</div>
	<p class="meta" style="margin:10px 3px 0">{SHOP_EARN_NOTE}</p>

	<div class="sec" style="margin-top:20px">
		브랜드 전용 아이템 <span class="console-sec-sub">— 브랜드 센터에서만 구매·사용</span>
	</div>
	<div class="shop-grid">
		{#each s.items as it (it.id)}
			{@const b = shopButton(it, s.balance, s.today)}
			<section class="card static shop-item" class:soon={b.kind === 'soon'}>
				<div class="shop-item-head">
					<div class="grow">
						<div class="shop-item-name">{it.name}</div>
						<p class="meta">{it.desc}</p>
					</div>
					<span class="celprice">{priceLabel(it)}</span>
				</div>
				<div class="btnrow" style="margin-top:12px">
					{#if b.kind === 'buy'}
						<form method="post" action="?/buy" class="console-form">
							<input type="hidden" name="item" value={it.id} />
							<button type="submit" class="pri sm" disabled={!b.enabled}>{b.label}</button>
						</form>
						{#if !b.enabled}<span class="meta">셀러리가 부족해요</span>{/if}
					{:else if b.kind === 'active'}
						<span class="chip plat">{b.label}</span>
					{:else if b.kind === 'auto'}
						<span class="chip">{b.label}</span>
					{:else}
						<span class="chip" title="효과를 준비하는 중이에요 — 곧 열립니다">{b.label}</span>
					{/if}
				</div>
			</section>
		{/each}
	</div>

	<div class="sec" style="margin-top:20px">셀러리 내역</div>
	{#if s.ledger.length}
		<div class="tblw">
			<table>
				<thead><tr><th>일자</th><th>내용</th><th class="num">변동</th></tr></thead>
				<tbody>
					{#each s.ledger as l, i (i)}
						<tr>
							<td>{l.createdAt?.slice(0, 10) ?? '-'}</td>
							<td style="white-space:normal">{ledgerLabel(l)}</td>
							<td class="num" class:plus={l.delta > 0}><b>{l.delta > 0 ? '+' : ''}{fmtNum(l.delta)}</b></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="listcard"><div class="empty" style="padding:24px">아직 셀러리 내역이 없어요</div></div>
	{/if}

	<div class="btnrow" style="margin-top:16px">
		<a href={data.galleryPath} class="btn sm ghost">인플루언서 갤러리</a>
		<a href={data.productsPath} class="btn sm ghost">상품 관리</a>
	</div>
{/if}
