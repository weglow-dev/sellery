<script lang="ts">
	/**
	 * 실시간 매출 — 프로토타입 vSales(js/30-shared.js · packages/ui/src/views/Sales.svelte) 의 브랜드 분기를 props 로 이식. 시뮬 토글은 없다(실서비스는 결제 웹훅이 반영).
	 *   상단: 합계 4칸(오늘 매출·주문 / 누적 순매출 / 예상 정산 지급액 / 진행 중 캠페인 수).
	 *   캠페인 카드(LIVE · CLEARING): 인플루언서(이름 · @핸들 · 등급) · 상품 · 기간 · D-n → mini-stats(오늘 / 누적 / 판매·잔여 / 마감·기준일)
	 *     → 판매 링크 · 스레드 · 주문 → 정산 예상(순매출 → PG → 인플루언서 수수료(등급 보너스·추천 부스트는 셀러리 부담) → 플랫폼+PG(`platformPgLine` · §8 열) → 브랜드 등급 할인 → **브랜드 정산 예상액**(`brandPayoutLine`))
	 *     → 최근 7일 매출 막대(daily[7] · PAID 합) → 최근 주문 8건(recent — 이름은 서버가 가운데를 가린 값).
	 *   빈 상태: "진행 중인 판매가 없어요" → /campaigns. 정산 정보 미완이면 "정산 정보를 등록해야 지급됩니다" 띠 → /settle.
	 *   금액 라인은 0019 `app_brand_sales` 값 그대로(순매출 − 인플루언서 수수료 − 플랫폼+PG = 브랜드 정산 예상액 · settlement-policy §11.3).
	 */
	import { brandDiscountLine, brandPayoutLine, brandRateLine, platformPgLine } from '@sellery/db/brand/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, md, toKstYmd } from '@sellery/db/dates';
	import { CopyButton, GradeBox, PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const today = $derived(data.today ?? '');
	const t = $derived(data.totals);
	const clearDays = $derived(data.rates?.clear_days ?? 21);
	const pgRate = $derived(data.rates?.pg_rate ?? 0.019);
	const platformRate = $derived(data.rates?.platform_rate ?? 0.1);
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
<p class="meta" style="margin:-8px 3px 14px">LIVE 판매의 판매 현황 — 주문이 들어오면 즉시 반영돼요. 브랜드 정산액은 판매 종료 <b>D+{clearDays}</b> 에 지급되고, 명세는 <a href={data.settlePath} style="text-decoration:underline">정산</a>에서 볼 수 있어요.</p>

{#if data.failed}
	<p class="notice danger" role="status">매출을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

{#if !data.settleInfoComplete && data.campaigns.length}
	<p class="notice danger" role="status">
		<b>정산 정보 미등록</b> — 정산 정보(계좌 · 사업자등록번호)를 등록해야 D+{clearDays} 지급이 실행됩니다. <a href={data.settlePath} style="text-decoration:underline;color:inherit">정산 정보 등록 →</a>
	</p>
{/if}

{#if t}
	<div class="mini-stats console-totals" style="margin-top:0">
		<div><span class="ms-l">오늘 매출</span><span class="ms-v">₩{fmtNum(t.today_gross)}</span><span class="ms-s">주문 {t.today_orders}건</span></div>
		<div><span class="ms-l">누적 순매출</span><span class="ms-v">₩{fmtNum(t.net)}</span><span class="ms-s">결제 {t.paid_count}건 · 환불 {t.refund_count}건</span></div>
		<div><span class="ms-l">예상 정산 지급액</span><span class="ms-v" style="color:var(--color-plat)">₩{fmtNum(t.brand_payout_est)}</span><span class="ms-s">수수료 차감 후 · 지금 기준</span></div>
		<div><span class="ms-l">진행 중 캠페인</span><span class="ms-v">{data.campaigns.length}건</span><span class="ms-s">판매 중 {data.campaigns.filter((c) => c.status === 'LIVE').length} · 교환·환불 {data.campaigns.filter((c) => c.status !== 'LIVE').length}</span></div>
	</div>
{/if}

{#if !data.campaigns.length}
	<div class="listcard">
		<div class="empty">
			진행 중인 판매가 없어요 — <a href={data.campaignsPath} style="text-decoration:underline">내 캠페인</a>에서 일정을 확정하면 여기서 매출이 보여요
		</div>
	</div>
{/if}

<div class="console-sales console-brand-sales">
	{#each data.campaigns as c (c.campaign_id)}
		{@const left = c.end_date ? daysBetween(today, c.end_date) : NaN}
		{@const mx = barMax(c.daily)}
		<section class="card static">
			<div class="hd">
				<div class="ttl">
					<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={34} />
					<span style="min-width:0">
						<b>{c.product.name}</b>
						<span class="sub">
							<PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} />
							<GradeBox grade={c.seller.grade} sm />
							· ₩{fmtNum(c.product.sale_price)}{#if c.start_date && c.end_date}{' '}· {md(c.start_date)}–{md(c.end_date)}{/if}
						</span>
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
				<div><span class="ms-l">판매 · 잔여</span><span class="ms-v">{fmtNum(c.qty_sold)}개</span><span class="ms-s">배정 {fmtNum(c.qty)} · 잔여 {fmtNum(Math.max(0, c.qty - c.sold_qty))}개</span></div>
				<div><span class="ms-l">{c.status === 'LIVE' ? '마감' : '정산 기준일'}</span><span class="ms-v">{c.status === 'LIVE' ? (Number.isNaN(left) ? '—' : `D-${Math.max(0, left)}`) : c.due ? md(c.due) : '—'}</span><span class="ms-s">{c.status === 'LIVE' ? `지급 ${c.due ? md(c.due) : '—'} 예정` : `종료 ${c.end_date ? md(c.end_date) : '—'} + ${clearDays}일`}</span></div>
			</div>

			<div class="console-link">
				<span class="lbl-sm">판매 링크</span>
				<code class="url" title={c.storeUrl}>{c.storeUrl}</code>
				<div class="btnrow">
					<CopyButton text={c.storeUrl} label="링크 복사" />
					<a href={c.storeUrl} class="btn sm ghost" target="_blank" rel="noopener">구매 페이지</a>
					<a href={c.href} class="btn sm ghost">스레드</a>
					<a href={c.ordersHref} class="btn sm ghost">주문 · 발주</a>
				</div>
			</div>

			<div class="console-sales-body">
				<div class="console-fee">
					<div class="lbl-sm">브랜드 정산 예상</div>
					<dl class="console-kv">
						<dt>순매출</dt>
						<dd>₩{fmtNum(c.net)} <span class="meta">(취소·환불 제외{#if c.sample_net > 0} · 샘플 구매분 ₩{fmtNum(c.sample_net)} 포함{/if})</span></dd>
						<dt>PG 수수료</dt>
						<dd>−₩{fmtNum(c.pg_fee)} <span class="meta">({Math.round(pgRate * 1000) / 10}% · 플랫폼+PG 에 포함)</span></dd>
						<dt>인플루언서 수수료</dt>
						<dd>
							−₩{fmtNum(c.seller_fee)}
							<span class="meta">{brandRateLine(c.seller_rate, c.seller_bonus_pp, c.ref_boost_applied)}{#if c.seller_fee_total !== c.seller_fee}{' '}· 인플루언서 수령 ₩{fmtNum(c.seller_fee_total)} — 등급 보너스·추천 부스트 ₩{fmtNum(c.seller_fee_total - c.seller_fee)} 는 셀러리 부담{/if}</span>
						</dd>
						<dt>플랫폼+PG</dt>
						<dd>−₩{fmtNum(c.platform_pg)} <span class="meta">({platformPgLine(platformRate, pgRate, data.brandGrade, c.brand_discount > 0 ? data.brandDiscountRate : 0, c.brand_ref_applied)})</span></dd>
						{#if c.brand_discount > 0 || c.brand_ref_boost > 0}
							<dt>브랜드 할인</dt>
							<dd>+₩{fmtNum(c.brand_discount + c.brand_ref_boost)} <span class="meta">({c.brand_discount > 0 ? `${data.brandGrade ?? '등급'} 등급 ₩${fmtNum(c.brand_discount)}` : ''}{c.brand_discount > 0 && c.brand_ref_boost > 0 ? ' · ' : ''}{c.brand_ref_boost > 0 ? `추천 ₩${fmtNum(c.brand_ref_boost)}` : ''} — 플랫폼+PG 에 반영됨)</span></dd>
						{/if}
						<dt>정산 예상액</dt>
						<dd><b style="color:var(--color-plat);font-size:15px">₩{fmtNum(c.brand_payout_est)}</b></dd>
						<dt>지급 예정</dt>
						<dd>{brandPayoutLine(c.net, c.brand_payout_est, c.due)}</dd>
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

{#if data.campaigns.length}
	<p class="meta" style="margin:8px 3px 0">브랜드 정산 예상액 = 순매출 − 인플루언서 수수료 − 플랫폼+PG · 브랜드 등급 할인({brandDiscountLine(data.brandDiscountRate, platformRate)})은 실시간 등급 기준이고, 정산 실행 시점의 등급 스냅샷이 정답이에요 · 등급 보너스·추천 부스트는 셀러리가 부담해요.</p>
{/if}
