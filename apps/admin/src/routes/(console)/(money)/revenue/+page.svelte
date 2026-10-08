<script lang="ts">
	/**
	 * 매출·순수익 — 데모 `(demo)/revenue`(프로토타입 `vAdminRevenue`)와 같은 구성:
	 *   1 KPI 4장  2 손익 요약  3 셀러리 포인트 손익  4 운영 비용 입력 + 최종 순이익  5 판매별 손익
	 *
	 * 금액은 전부 서버(`app_admin_revenue` · 0022)가 계산한 값이다 — 화면은 표시만 한다.
	 * 운영 비용만 입력이고, 입력을 바꾸면 저장 전에도 다시 계산된다(데모와 같다).
	 *
	 * **GMV 정의를 화면에 적는다** — 이 화면은 샘플 구매분도 넣고 대시보드는 넣지 않는다.
	 * 두 화면 숫자가 다른 이유를 운영이 찾아보지 않아도 되게 한다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { OPEX_FALLBACK, OPEX_MESSAGES, OPEX_ROWS, opexBreakdown, profitSummary, type Opex } from '@sellery/db/admin/revenue-rules';
	import { StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const v = $derived(data.view);
	const won = (n: number) => `₩${fmtNum(Math.round(n))}`;
	const pct = (r: number | null, d = 2) => (r === null ? '—' : `${(r * 100).toFixed(d)}%`);

	/**
	 * 입력 중인 운영비 — 저장하지 않아도 아래 표가 즉시 따라온다(데모 `bind:value` 대응 · "서버비가 2배면?" 확인용).
	 * **동기 초기화**라 SSR 에서도 입력칸이 그려진다. 저장 폼은 `use:enhance` 를 쓰지 않아 303 뒤 페이지가 다시 로드되고,
	 * 그때 이 상태도 서버 값으로 다시 초기화된다.
	 */
	let draft = $state<Opex>({ ...(data.view?.opex ?? OPEX_FALLBACK) });

	const bd = $derived(v ? opexBreakdown({ opex: draft, ...v.basis, celCover: v.celCover }) : null);
	/**
	 * 최종 순이익은 **정산 후 환불을 반영한 값**으로 계산한다(0050).
	 * 정산이 끝난 뒤 환불이 들어오면 주문은 `CANCELED` 가 되고 스냅샷(`net`·`platform_net`)에는
	 * 반영될 수 없다 — 브랜드·인플루언서 지급액은 확정이라 줄지 않으므로 환불액은 플랫폼 몫에서 빠진다.
	 * 조정분이 없으면 `*_adjusted` 는 조정 전과 같다(파서가 보정).
	 */
	const pf = $derived(v && bd ? profitSummary(v.totals.net_adjusted, v.totals.platform_net_adjusted, bd.total) : null);
	/** 저장된 값과 다르면 "저장 전" 표시 */
	const dirty = $derived(!!v && OPEX_ROWS.some((r) => draft[r.key] !== v.opex[r.key]));

	const msg = $derived(data.msg ? (OPEX_MESSAGES[data.msg] ?? null) : null);

	const campaignHref = (code: string | null) => (code ? `${data.campaignsPath}/${encodeURIComponent(code)}` : null);
	function rowClick(href: string | null) {
		return (e: MouseEvent) => {
			if (!href || (e.target as HTMLElement).closest('a,button,form,input')) return;
			goto(href);
		};
	}
	function rowKey(href: string | null) {
		return (e: KeyboardEvent) => {
			if (!href || (e.key !== 'Enter' && e.key !== ' ')) return;
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			e.preventDefault();
			goto(href);
		};
	}
</script>

<svelte:head>
	<title>매출·순수익 — 셀러리 관리자</title>
</svelte:head>

<h2 class="pg">
	매출·순수익
	<small>확정 매출 기준 · PG수수료·보상비용·부가세를 제외한 플랫폼 순수익</small>
</h2>

{#if msg}<p class="notice ok" role="status">{msg}</p>{/if}
{#if form?.opexError}<p class="notice danger" role="alert">{form.opexError}</p>{/if}

{#if !v}
	<p class="notice danger" role="status">손익을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
{:else}
	<!-- 1. KPI -->
	<div class="grid g4 rev-kpis">
		<div class="card static kpi">
			<div class="lbl">확정 거래액 (GMV)</div>
			<div class="val">{won(v.totals.net)}</div>
			<div class="sub">결제 {won(v.totals.gross)} − 환불 {won(v.totals.refunds)}</div>
		</div>
		<div class="card static kpi">
			<div class="lbl">플랫폼 수수료 매출</div>
			<div class="val">{won(v.totals.platform_fee)}</div>
			<div class="sub">10% {won(v.totals.platform_fee_gross)} − 보상·할인 {won(v.totals.costs)}</div>
		</div>
		<div class="card static kpi">
			<div class="lbl">플랫폼 순수익 (VAT 제외)</div>
			<div class="val accent">{won(v.totals.platform_net)}</div>
			<div class="sub">부가세 {won(v.totals.vat)} 제외 · 순 테이크레이트 {pct(v.profit.takeRate)}</div>
		</div>
		<div class="card static kpi">
			<div class="lbl">셀러리 충전 매출</div>
			<div class="val">{won(v.celery.topup_won)}</div>
			<div class="sub">공급가 {won(v.celery.topup_net)} · 충전 {fmtNum(v.celery.topup_count)}건 · 소진 {fmtNum(v.celery.spent)}🥬</div>
		</div>
	</div>

	<p class="notice rev-gmv-note" role="note">
		<b>이 화면의 GMV 는 대시보드보다 넓습니다</b> — 판매가 열린 캠페인(진행중 · 교환·환불 기간 · 정산 완료)에
		<b>인플루언서 샘플 구매분</b>({won(v.totals.sample_net)})을 더해 셉니다. 대시보드 누적 GMV 는 샘플 구매분을 빼고
		판매가 열린 캠페인만 셉니다.
		{#if v.counts.no_snapshot}
			정산 명세가 없는 {v.counts.no_snapshot}건은 금액을 계산할 수 없어 합계에서 빠졌습니다.
		{/if}
	</p>

	<div class="grid g2 rev-2col">
		<!-- 2. 손익 요약 -->
		<section class="card static">
			<h4>손익 요약 <span class="meta">— 판매 {fmtNum(v.counts.campaigns)}건</span></h4>
			<table class="stmt rev-stmt">
				<tbody>
					<tr><td>총 결제액</td><td class="num">{won(v.totals.gross)}</td></tr>
					<tr><td>환불</td><td class="num">−{won(v.totals.refunds)}</td></tr>
					<tr class="sum"><td>확정 매출 (GMV)</td><td class="num">{won(v.totals.net)}</td></tr>
					<tr><td class="in">└ 인플루언서 샘플 구매분 <small>인플 수수료 0 · 플랫폼 10% 동일</small></td><td class="num">{won(v.totals.sample_net)}</td></tr>
					<tr><td>PG 수수료 1.9% <small>브랜드 정산에서 차감 · 플랫폼 수익 아님</small></td><td class="num">−{won(v.totals.pg_fee)}</td></tr>
					<tr><td>인플루언서 지급 <small>기본 + 등급 보너스 + 추천 부스트</small></td><td class="num">−{won(v.totals.seller_fee_total)}</td></tr>
					<tr><td>브랜드 정산액</td><td class="num">−{won(v.totals.brand_payout)}</td></tr>
					<tr class="sum"><td>플랫폼 수수료 총액 10%</td><td class="num">{won(v.totals.platform_fee_gross)}</td></tr>
					<tr><td class="in">− 인플루언서 등급 보너스</td><td class="num">−{won(v.totals.seller_bonus)}</td></tr>
					<tr><td class="in">− 인플루언서 추천 보상·부스트</td><td class="num">−{won(v.totals.ref_boost + v.totals.ref_reward)}</td></tr>
					<tr><td class="in">− 브랜드 추천 보상·할인</td><td class="num">−{won(v.totals.brand_ref_boost + v.totals.brand_ref_reward)}</td></tr>
					<tr><td class="in">− 브랜드 등급 수수료 할인</td><td class="num">−{won(v.totals.brand_discount)}</td></tr>
					<tr><td>수수료 매출 (VAT 포함)</td><td class="num">{won(v.totals.platform_fee)}</td></tr>
					<tr><td class="in">− 부가세 10%</td><td class="num">−{won(v.totals.vat)}</td></tr>
					<tr class="tot"><td>플랫폼 순수익</td><td class="num accent">{won(v.totals.platform_net)}</td></tr>
					<!--
						정산 후 환불(0050) — 스냅샷은 지급 계약이라 바뀌지 않는다. 그 뒤 들어온 환불은
						브랜드·인플루언서 지급액을 줄이지 못하므로 플랫폼이 흡수한다. 조정분이 있을 때만 보여준다.
					-->
					{#if v.totals.post_refunds > 0}
						<tr>
							<td class="in">
								− 정산 후 환불 <small>{v.totals.post_refund_count}건 · 스냅샷 확정 뒤 들어온 환불 (플랫폼 흡수)</small>
							</td>
							<td class="num">−{won(v.totals.post_refunds)}</td>
						</tr>
						<tr class="tot"><td>플랫폼 순수익 (환불 조정 후)</td><td class="num accent">{won(v.totals.platform_net_adjusted)}</td></tr>
					{/if}
				</tbody>
			</table>
		</section>

		<!-- 3. 셀러리 -->
		<section class="card static">
			<h4>셀러리 포인트 손익</h4>
			<table class="stmt rev-stmt">
				<tbody>
					<tr><td>충전 결제액 (VAT 포함)</td><td class="num">{won(v.celery.topup_won)}</td></tr>
					<tr><td class="in">− 부가세</td><td class="num">−{won(v.celery.topup_won - v.celery.topup_net)}</td></tr>
					<tr class="tot"><td>충전 순매출</td><td class="num">{won(v.celery.topup_net)}</td></tr>
					<tr><td>무상 발행 <small>가입·이벤트</small></td><td class="num">{fmtNum(v.celery.granted)} 🥬</td></tr>
					<tr><td>매출 달성 획득 <small>₩500만당 1</small></td><td class="num">{fmtNum(v.celery.earned)} 🥬</td></tr>
					<tr><td>소진</td><td class="num">{fmtNum(v.celery.spent)} 🥬</td></tr>
					<tr><td>미사용 잔액 (부채) <small>충전가 환산 {won(v.celery.balance * v.celery.cel_won_unit)}</small></td><td class="num">{fmtNum(v.celery.balance)} 🥬</td></tr>
				</tbody>
			</table>
			<p class="rev-foot">
				셀러리 1개 = 충전가 {won(v.celery.cel_won_unit)} 기준. 무상 발행·획득분은 매출이 아닌 마케팅 비용으로,
				미사용 잔액은 부채로 잡습니다.
			</p>
		</section>
	</div>

	<!-- 4. 운영 비용 -->
	<div class="sec">
		운영 비용 · 최종 순이익
		<span class="sec-note">서버·DB·Claude API·알림톡 등 (월 기준 추정 · 수정 가능)</span>
	</div>

	<div class="grid g2 rev-2col">
		<section class="card static">
			<h4>운영 비용 입력 (월)</h4>
			<form method="POST" action="?/saveOpex">
				<table class="stmt rev-stmt">
					<tbody>
						{#each OPEX_ROWS as r (r.key)}
							<tr>
								<td><label for="opex-{r.key}">{r.label}</label>{#if r.note}<small>{r.note}</small>{/if}</td>
								<td class="num">
									<input id="opex-{r.key}" name={r.key} type="number" min="0" step="1000" bind:value={draft[r.key]} class="rev-input" />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="btnrow rev-btns">
					<button type="submit" class="pri sm">비용 저장 · 재계산</button>
					<button type="submit" formaction="?/resetOpex" class="ghost sm">기본값</button>
					{#if dirty}<span class="rev-dirty">저장 전 — 오른쪽 표는 입력값으로 계산됩니다</span>{/if}
				</div>
			</form>
		</section>

		<section class="card static">
			<h4>비용 집계 → 최종 순이익</h4>
			{#if bd && pf}
				<table class="stmt rev-stmt">
					<tbody>
						<tr><td>고정비 합계 (월)</td><td class="num">−{won(bd.fixed)}</td></tr>
						<tr><td class="in">알림톡 <small>{fmtNum(v.basis.orders)}건 × 3</small></td><td class="num">−{won(bd.kakao)}</td></tr>
						<tr><td class="in">Claude API <small>{fmtNum(v.basis.sellers)}명 × 30일 + 추론 {fmtNum(v.basis.inferences)}건</small></td><td class="num">−{won(bd.claude)}</td></tr>
						<tr><td class="in">PG 고정비</td><td class="num">−{won(bd.pgFixed)}</td></tr>
						<tr><td class="in">샘플 셀러리 결제 보전 <small>🥬로 낸 샘플값을 브랜드에 원화 지급</small></td><td class="num">−{won(bd.celCover)}</td></tr>
						<tr class="sum"><td>운영 비용 합계</td><td class="num">−{won(bd.total)}</td></tr>
						<tr><td>플랫폼 순수익 (VAT 제외)</td><td class="num">{won(v.totals.platform_net)}</td></tr>
						<tr class="tot">
							<td>운영비 차감 최종 순이익</td>
							<td class="num" class:accent={pf.finalNet >= 0} class:down={pf.finalNet < 0}>{pf.finalNet < 0 ? '−' : ''}{won(Math.abs(pf.finalNet))}</td>
						</tr>
						<tr><td>손익분기 월 GMV <small>운영비 ÷ 순 테이크레이트 {pct(pf.takeRate)}</small></td><td class="num">{pf.breakEvenGmv === null ? '—' : won(pf.breakEvenGmv)}</td></tr>
						<tr><td>운영비율 <small>운영비 ÷ GMV</small></td><td class="num">{pct(pf.opexRatio)}</td></tr>
					</tbody>
				</table>
			{/if}
			<p class="rev-foot">
				PG 1.9% 는 브랜드 정산에서 차감되는 통과 비용이라 위 순수익에 이미 반영됩니다(플랫폼 부담 아님).
				운영비는 월 단위 추정치이고 확정 매출은 누적 기준이라, 실제 월 손익과는 다릅니다.
			</p>
		</section>
	</div>

	<!-- 5. 판매별 손익 -->
	<div class="sec">
		판매별 손익
		{#if v.rows.length}<span class="badge">{fmtNum(v.rows.length)}</span>{/if}
	</div>

	<div class="tblw admin-table rev-table">
		<table>
			<thead>
				<tr>
					<th>판매</th>
					<th class="num">확정 매출</th>
					<th class="num">PG</th>
					<th class="num">인플루언서</th>
					<th class="num">브랜드</th>
					<th class="num">수수료 10%</th>
					<th class="num">보상·할인</th>
					<th class="num">VAT</th>
					<th class="num">순수익</th>
					<th>상태</th>
				</tr>
			</thead>
			<tbody>
				{#each v.rows as r (r.campaign_id)}
					{@const chip = campaignStatusChip(r.campaign_status)}
					{@const unknown = r.source === 'none'}
					{@const href = campaignHref(r.campaign_code)}
					<tr
						class:clickable={!!href}
						class:row-muted={unknown}
						onclick={rowClick(href)}
						onkeydown={rowKey(href)}
						tabindex={href ? 0 : undefined}
						role={href ? 'link' : undefined}
						aria-label={href ? `${r.product_name ?? r.campaign_code} 캠페인 상세` : undefined}
					>
						<td data-l="판매">
							{#if href}
								<a href={href}><b>{r.product_name ?? r.campaign_code}</b></a>
							{:else}
								<b>{r.product_name ?? '—'}</b>
							{/if}
							<small>
								{r.seller_handle ?? ''}{#if r.campaign_code}{r.seller_handle ? ' · ' : ''}<span class="console-mono">{r.campaign_code.toUpperCase()}</span>{/if}
								{#if r.samplePending} · 샘플 구매만 — 브랜드 지급 규칙 미정{/if}
							</small>
						</td>
						<td class="num" data-l="확정 매출">{unknown ? '—' : won(r.net)}</td>
						<td class="num" data-l="PG">{unknown ? '—' : won(r.pg_fee)}</td>
						<td class="num" data-l="인플루언서">{unknown ? '—' : won(r.seller_fee_total)}</td>
						<td class="num" data-l="브랜드">{unknown ? '—' : won(r.brand_payout)}</td>
						<td class="num" data-l="수수료">{unknown ? '—' : won(r.platform_fee_gross)}</td>
						<td class="num" data-l="보상·할인">{unknown ? '—' : `−${won(r.costs)}`}</td>
						<td class="num" data-l="VAT">{unknown ? '—' : `−${won(r.vat)}`}</td>
						<td class="num" data-l="순수익"><b>{unknown ? '—' : won(r.platform_net)}</b></td>
						<td data-l="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></td>
					</tr>
				{:else}
					<tr><td colspan="10" class="empty">확정 매출이 있는 판매가 없습니다</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if v.counts.no_snapshot}
		<p class="rev-foot rev-table-foot">— 표시된 건은 정산 명세가 없어 금액을 계산할 수 없습니다(정산 실행 시 생성됩니다).</p>
	{/if}
{/if}

<style>
	/* KPI 카드 — 데모 `.card.kpi` (lbl · val · sub) */
	.rev-kpis {
		gap: 14px;
	}
	.kpi {
		margin: 3px;
	}
	.kpi .lbl {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-mute);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 700;
	}
	.kpi .val {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin-top: 6px;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.kpi .sub {
		font-size: 11.5px;
		color: var(--color-mute);
		margin-top: 4px;
		line-height: 1.5;
		word-break: keep-all;
	}
	.accent {
		color: var(--color-accent);
	}
	.down {
		color: var(--color-danger);
	}

	.rev-gmv-note {
		margin: 18px 3px 0;
	}
	.rev-2col {
		gap: 14px;
		margin-top: 18px;
		align-items: start;
	}
	.rev-2col > .card {
		margin: 3px;
	}
	.rev-2col h4 .meta {
		font-weight: 400;
		margin: 0;
	}

	/* 손익 명세 — 데모 `.stmt` (항목 · 금액 두 칸) */
	.rev-stmt {
		width: 100%;
		min-width: 0;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	.rev-stmt td {
		padding: 7px 10px;
		word-break: keep-all;
	}
	.rev-stmt td.num {
		white-space: nowrap;
		color: var(--color-ink);
	}
	.rev-stmt td small {
		font-size: 11px;
		color: var(--color-mute);
		margin-left: 4px;
		font-weight: 400;
	}
	/* 들여쓴 하위 항목 */
	.rev-stmt td.in {
		padding-left: 22px;
	}
	.rev-stmt .sum td {
		font-weight: 700;
		color: var(--color-ink);
	}
	.rev-stmt .tot td {
		color: var(--color-ink);
	}
	.rev-stmt .tot td.accent {
		color: var(--color-accent);
	}
	.rev-stmt .tot td.down {
		color: var(--color-danger);
	}
	.rev-input {
		width: 120px;
		margin: 0;
		padding: 4px 8px;
		font-size: 12px;
		text-align: right;
	}
	.rev-btns {
		margin-top: 12px;
		align-items: center;
	}
	.rev-btns button {
		margin: 0;
	}
	.rev-dirty {
		font-size: 11.5px;
		color: var(--color-danger);
	}
	.rev-foot {
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.6;
		margin: 10px 0 0;
		word-break: keep-all;
	}
	.rev-table-foot {
		margin: 6px 4px 0;
	}

	.sec-note {
		font-family: var(--font-sans);
		font-size: 11.5px;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
		color: var(--color-mute);
	}

	.rev-table td small .console-mono {
		font-size: 10.5px;
	}
	tr.row-muted td {
		color: var(--color-mute);
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover td {
		background: color-mix(in srgb, var(--color-lime) 12%, transparent);
	}

	@media (max-width: 900px) {
		.rev-kpis {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.rev-2col {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 560px) {
		.rev-kpis {
			grid-template-columns: 1fr;
		}
		.kpi .val {
			font-size: 22px;
		}
	}
</style>
