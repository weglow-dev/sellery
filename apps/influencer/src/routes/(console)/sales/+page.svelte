<script lang="ts">
	/**
	 * 실시간 매출 — 프로토타입 vSales(js/30-shared.js · packages/ui/src/views/Sales.svelte) 의 인플루언서 분기를 props 로 이식. 시뮬 토글은 없다(실서비스는 결제 웹훅이 반영).
	 *   상단: 합계 4칸(오늘 매출 · 누적 확정 매출 · 내 수수료(세전) · 실수령 예정 — 원천징수는 settle_type 기준).
	 *   캠페인 카드(LIVE · CLEARING): 상품·브랜드·기간·상태 칩 → mini-stats(오늘 매출·주문 / 누적 순매출(취소·환불 제외) 결제·환불 건수 / 판매 수량·잔여 / 마감 D-n)
	 *     → 판매 링크(복사 · 구매 페이지) → 내 수수료 예상(rateLine · 기본 수수료 · 등급 보너스 · 추천 부스트 · 세전 합계 · whtLine · 실수령 예정 · 지급 예정일)
	 *     → 최근 7일 매출 막대(daily[7] · PAID 합) · 최근 주문 8건(recent — 이름은 서버가 가운데를 가린 값).
	 *   빈 상태: "진행 중인 판매가 없어요" → /campaigns. 정산은 판매 종료 D+21(settleDue) — 자세한 내역은 /settle.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, md, toKstYmd } from '@sellery/db/dates';
	import { rateLine, whtLine } from '@sellery/db/partner/settle-rules';
	import { CopyButton, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const today = $derived(data.today ?? '');
	const t = $derived(data.totals);
	const isBiz = $derived(data.whtRate === 0);
	const clearDays = $derived(data.rates?.clear_days ?? 21);
	const barMax = (daily: { gross: number }[]) => Math.max(1, ...daily.map((x) => x.gross));
	const kWon = (n: number) => (n >= 1000 ? `₩${fmtNum(Math.round(n / 1000))}k` : n > 0 ? `₩${fmtNum(n)}` : '');
	const dayLabel = (iso: string) => md(toKstYmd(iso) ?? iso);
</script>

<svelte:head>
	<title>실시간 매출 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>실시간 매출</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">LIVE 판매의 판매 현황 — 주문이 들어오면 즉시 반영돼요. 정산은 판매 종료 <b>D+{clearDays}</b> 에 지급되고, 명세는 <a href={data.settlePath} style="text-decoration:underline">정산</a>에서 볼 수 있어요.</p>

{#if data.failed}
	<p class="notice danger" role="status">매출을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

{#if !data.seller.has_bank_info && data.campaigns.length}
	<p class="notice danger" role="status">
		<b>정산 계좌 미등록</b> — 계좌를 등록해야 D+{clearDays} 지급이 실행됩니다. <a href={data.settlePath} style="text-decoration:underline;color:inherit">정산 정보 등록 →</a>
	</p>
{/if}

{#if t}
	<div class="mini-stats console-totals" style="margin-top:0">
		<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmtNum(t.today_gross)}</span><span class="ms-s">주문 {t.today_orders}건</span></div>
		<div><span class="ms-l">누적 확정 매출</span><span class="ms-v">₩{fmtNum(t.net)}</span><span class="ms-s">결제 {t.paid_count}건 · 환불 {t.refund_count}건</span></div>
		<div><span class="ms-l">내 수수료 (세전)</span><span class="ms-v">₩{fmtNum(t.my_fee_total)}</span><span class="ms-s">{isBiz ? '세금계산서 발행' : `원천징수 −₩${fmtNum(t.wht)}`}</span></div>
		<div><span class="ms-l">실수령 예정</span><span class="ms-v" style="color:var(--color-plat)">₩{fmtNum(t.my_payout_est)}</span><span class="ms-s">{isBiz ? '원천징수 없음' : '원천징수 후 예상'}</span></div>
	</div>
{/if}

{#if !data.campaigns.length}
	<div class="listcard">
		<div class="empty">
			진행 중인 판매가 없어요 — <a href={data.campaignsPath} style="text-decoration:underline">내 캠페인</a>에서 일정을 확정하면 여기서 매출이 보여요
		</div>
	</div>
{/if}

<div class="console-sales">
	{#each data.campaigns as c (c.campaign_id)}
		{@const left = c.end_date ? daysBetween(today, c.end_date) : NaN}
		{@const mx = barMax(c.daily)}
		<section class="card static">
			<div class="hd">
				<div class="ttl">
					<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={34} />
					<span style="min-width:0">
						<b>{c.product.name}</b>
						<span class="sub">{c.brand.name} · ₩{fmtNum(c.product.sale_price)}{#if c.start_date && c.end_date}{' '}· {md(c.start_date)}–{md(c.end_date)}{/if}</span>
					</span>
				</div>
				{#if c.status === 'LIVE'}
					<StatusChip tone="live">판매 중</StatusChip>
				{:else}
					<StatusChip tone="amber">교환·환불 기간</StatusChip>
				{/if}
			</div>

			<div class="mini-stats">
				<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmtNum(c.today_gross)}</span><span class="ms-s">주문 {c.today_orders}건</span></div>
				<div><span class="ms-l">누적 순매출</span><span class="ms-v">₩{fmtNum(c.net)}</span><span class="ms-s">결제 {c.paid_count}건 · 환불 {c.refund_count}건</span></div>
				<div><span class="ms-l">판매 · 잔여</span><span class="ms-v">{fmtNum(c.qty_sold)}개</span><span class="ms-s">잔여 {fmtNum(Math.max(0, c.qty - c.sold_qty))}개</span></div>
				<div><span class="ms-l">{c.status === 'LIVE' ? '마감' : '정산 기준일'}</span><span class="ms-v">{c.status === 'LIVE' ? (Number.isNaN(left) ? '—' : `D-${Math.max(0, left)}`) : c.due ? md(c.due) : '—'}</span><span class="ms-s">{c.status === 'LIVE' ? `지급 ${c.due ? md(c.due) : '—'} 예정` : `종료 ${c.end_date ? md(c.end_date) : '—'} + ${clearDays}일`}</span></div>
			</div>

			<div class="console-link">
				<span class="lbl-sm">판매 링크</span>
				<code class="url" title={c.storeUrl}>{c.storeUrl}</code>
				<div class="btnrow">
					<CopyButton text={c.storeUrl} label="링크 복사" />
					<a href={c.storeUrl} class="btn sm ghost" target="_blank" rel="noopener">구매 페이지</a>
					<a href={c.href} class="btn sm ghost">스레드</a>
				</div>
			</div>

			<div class="console-sales-body">
				<div class="console-fee">
					<div class="lbl-sm">내 수수료 예상</div>
					<dl class="console-kv">
						<dt>수수료율</dt>
						<dd>{rateLine(c.my_rate, c.grade, c.grade_bonus_pp, c.ref_boost_applied)}</dd>
						<dt>기본 수수료</dt>
						<dd>₩{fmtNum(c.my_fee)}{#if c.sample_net > 0}<span class="meta"> (샘플 구매분 ₩{fmtNum(c.sample_net)} 제외)</span>{/if}</dd>
						{#if c.grade_bonus > 0}
							<dt>등급 보너스</dt>
							<dd>+₩{fmtNum(c.grade_bonus)} <span class="meta">({c.grade ?? '등급'} +{c.grade_bonus_pp}%p · 플랫폼 부담)</span></dd>
						{/if}
						{#if c.ref_boost > 0}
							<dt>추천 부스트</dt>
							<dd>+₩{fmtNum(c.ref_boost)} <span class="meta">(+1%p · 첫 {data.rates?.ref_times ?? 5}회)</span></dd>
						{/if}
						<dt>세전 합계</dt>
						<dd><b>₩{fmtNum(c.my_fee_total)}</b></dd>
						<dt>원천징수</dt>
						<dd>{whtLine(data.whtRate ?? 0.033, c.wht)}</dd>
						<dt>실수령 예정</dt>
						<dd><b style="color:var(--color-plat);font-size:15px">₩{fmtNum(c.my_payout_est)}</b></dd>
						<dt>지급 예정</dt>
						<dd>{c.due ? `${md(c.due)} (판매 종료 D+${clearDays})` : '—'}</dd>
					</dl>
				</div>

				<div class="console-bars-card">
					<div class="lbl-sm">최근 7일 매출</div>
					<div class="console-barwrap">
						<div class="console-bars" role="img" aria-label="최근 7일 일별 매출">
							{#each c.daily as x (x.d)}
								<div class="b" style="height:{Math.max(3, Math.round((x.gross / mx) * 100))}%" title="{x.d} ₩{fmtNum(x.gross)}">
									<span class="bl">{kWon(x.gross)}</span>
									<span class="bd">{md(x.d)}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<div class="lbl-sm" style="margin-top:14px">최근 주문</div>
			<div class="listcard console-rows console-feed">
				{#each c.recent as o (o.code)}
					<div class="rowitem">
						<div class="grow">
							<span style="font-weight:600">{o.buyer_masked}</span>
							<span class="sub">{o.qty}개 · {dayLabel(o.paid_at)}</span>
						</div>
						<span class="num">₩{fmtNum(o.amount)}</span>
						{#if o.status === 'REFUNDED'}<StatusChip tone="red">환불</StatusChip>{/if}
					</div>
				{:else}
					<div class="empty" style="padding:16px">아직 주문 없음</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
