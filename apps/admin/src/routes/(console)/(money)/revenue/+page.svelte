<script lang="ts">
	/**
	 * 매출·순수익 — 데모 `(demo)/revenue`(프로토타입 `vAdminRevenue`)와 같은 구성:
	 *   1 KPI 4장  2 손익 요약  3 셀러리 포인트 손익  4 운영 비용 입력 + 최종 순이익  5 판매별 손익
	 *
	 * 금액은 전부 서버(`app_admin_revenue` · 0022)가 계산한 값이다 — 화면은 표시만 한다.
	 * 운영 비용만 입력이고, 입력을 바꾸면 저장 전에도 다시 계산된다(데모와 같다).
	 *
	 * **GMV 정의를 화면에 적는다** — 이 화면은 샘플 구매만 있는 캠페인도 넣고(sample-policy §169)
	 * 대시보드는 넣지 않는다(§172). 두 화면 숫자가 다른 이유를 운영이 찾아보지 않아도 되게 한다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { OPEX_FALLBACK, OPEX_MESSAGES, OPEX_ROWS, opexBreakdown, profitSummary, type Opex } from '@sellery/db/admin/revenue-rules';
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
	const pf = $derived(v && bd ? profitSummary(v.totals.net, v.totals.platform_net, bd.total) : null);
	/** 저장된 값과 다르면 "저장 전" 표시 */
	const dirty = $derived(!!v && OPEX_ROWS.some((r) => draft[r.key] !== v.opex[r.key]));

	const msg = $derived(data.msg ? (OPEX_MESSAGES[data.msg] ?? null) : null);
</script>

<svelte:head>
	<title>매출·순수익 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>매출·순수익</h2>
	<span class="meta">확정 매출 기준 · PG 수수료 · 보상 비용 · 부가세를 제외한 플랫폼 순수익</span>
</div>

{#if msg}<p class="notice" role="status">{msg}</p>{/if}
{#if form?.opexError}<p class="notice danger" role="alert">{form.opexError}</p>{/if}

{#if !v}
	<p class="notice danger" role="status">손익을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
{:else}
	<!-- 1. KPI -->
	<div class="rev-kpis">
		<div class="rev-kpi">
			<span class="l">확정 거래액 (GMV)</span>
			<b class="v">{won(v.totals.net)}</b>
			<span class="meta">결제 {won(v.totals.gross)} − 환불 {won(v.totals.refunds)}</span>
		</div>
		<div class="rev-kpi">
			<span class="l">플랫폼 수수료 매출</span>
			<b class="v">{won(v.totals.platform_fee)}</b>
			<span class="meta">10% {won(v.totals.platform_fee_gross)} − 보상·할인 {won(v.totals.costs)}</span>
		</div>
		<div class="rev-kpi">
			<span class="l">플랫폼 순수익 (VAT 제외)</span>
			<b class="v">{won(v.totals.platform_net)}</b>
			<span class="meta">부가세 {won(v.totals.vat)} 제외 · 순 테이크레이트 {pct(v.profit.takeRate)}</span>
		</div>
		<div class="rev-kpi">
			<span class="l">셀러리 충전 매출</span>
			<b class="v">{won(v.celery.topup_won)}</b>
			<span class="meta">공급가 {won(v.celery.topup_net)} · 충전 {fmtNum(v.celery.topup_count)}건 · 소진 {fmtNum(v.celery.spent)}🥬</span>
		</div>
	</div>

	<p class="notice" role="note">
		<b>이 화면의 GMV 는 대시보드보다 넓습니다</b> — 판매가 열린 캠페인(진행중 · 교환·환불 기간 · 정산 완료)에
		<b>인플루언서 샘플 구매분</b>({won(v.totals.sample_net)})을 더해 셉니다. 대시보드 누적 GMV 는 샘플 구매분을 빼고
		판매가 열린 캠페인만 셉니다.
		{#if v.counts.no_snapshot}
			정산 명세가 없는 {v.counts.no_snapshot}건은 금액을 계산할 수 없어 합계에서 빠졌습니다.
		{/if}
	</p>

	<div class="rev-2col">
		<!-- 2. 손익 요약 -->
		<section class="console-card">
			<h4>손익 요약 <span class="meta">판매 {fmtNum(v.counts.campaigns)}건</span></h4>
			<table class="rev-stmt">
				<tbody>
					<tr><th>총 결제액</th><td class="num">{won(v.totals.gross)}</td></tr>
					<tr><th>환불</th><td class="num">−{won(v.totals.refunds)}</td></tr>
					<tr class="sum"><th>확정 매출 (GMV)</th><td class="num">{won(v.totals.net)}</td></tr>
					<tr><th class="in">└ 인플루언서 샘플 구매분 <span class="meta">인플 수수료 0 · 플랫폼 10% 동일</span></th><td class="num">{won(v.totals.sample_net)}</td></tr>
					<tr><th>PG 수수료 1.9% <span class="meta">브랜드 정산에서 차감 · 플랫폼 수익 아님</span></th><td class="num">−{won(v.totals.pg_fee)}</td></tr>
					<tr><th>인플루언서 지급 <span class="meta">기본 + 등급 보너스 + 추천 부스트</span></th><td class="num">−{won(v.totals.seller_fee_total)}</td></tr>
					<tr><th>브랜드 정산액</th><td class="num">−{won(v.totals.brand_payout)}</td></tr>
					<tr class="sum"><th>플랫폼 수수료 총액 10%</th><td class="num">{won(v.totals.platform_fee_gross)}</td></tr>
					<tr><th class="in">− 인플루언서 등급 보너스</th><td class="num">−{won(v.totals.seller_bonus)}</td></tr>
					<tr><th class="in">− 인플루언서 추천 보상·부스트</th><td class="num">−{won(v.totals.ref_boost + v.totals.ref_reward)}</td></tr>
					<tr><th class="in">− 브랜드 추천 보상·할인</th><td class="num">−{won(v.totals.brand_ref_boost + v.totals.brand_ref_reward)}</td></tr>
					<tr><th class="in">− 브랜드 등급 수수료 할인</th><td class="num">−{won(v.totals.brand_discount)}</td></tr>
					<tr><th>수수료 매출 (VAT 포함)</th><td class="num">{won(v.totals.platform_fee)}</td></tr>
					<tr><th class="in">− 부가세 10%</th><td class="num">−{won(v.totals.vat)}</td></tr>
					<tr class="tot"><th>플랫폼 순수익</th><td class="num">{won(v.totals.platform_net)}</td></tr>
				</tbody>
			</table>
		</section>

		<!-- 3. 셀러리 -->
		<section class="console-card">
			<h4>셀러리 포인트 손익</h4>
			<table class="rev-stmt">
				<tbody>
					<tr><th>충전 결제액 (VAT 포함)</th><td class="num">{won(v.celery.topup_won)}</td></tr>
					<tr><th class="in">− 부가세</th><td class="num">−{won(v.celery.topup_won - v.celery.topup_net)}</td></tr>
					<tr class="tot"><th>충전 순매출</th><td class="num">{won(v.celery.topup_net)}</td></tr>
					<tr><th>무상 발행 (가입·입점·관리자 지급)</th><td class="num">{fmtNum(v.celery.granted)} 🥬</td></tr>
					<tr><th>매출 달성 획득</th><td class="num">{fmtNum(v.celery.earned)} 🥬</td></tr>
					<tr><th>소진</th><td class="num">{fmtNum(v.celery.spent)} 🥬</td></tr>
					<tr><th>미사용 잔액 (부채) <span class="meta">충전가 환산 {won(v.celery.balance * v.celery.cel_won_unit)}</span></th><td class="num">{fmtNum(v.celery.balance)} 🥬</td></tr>
				</tbody>
			</table>
			<p class="meta">
				셀러리 1개 = 충전가 {won(v.celery.cel_won_unit)} 기준. 무상 발행·획득분은 매출이 아닌 마케팅 비용으로,
				미사용 잔액은 부채로 잡습니다.
			</p>
		</section>
	</div>

	<!-- 4. 운영 비용 -->
	<div class="rev-2col">
		<section class="console-card">
			<h4>운영 비용 입력 <span class="meta">월 기준 추정</span></h4>
			<form method="POST" action="?/saveOpex">
				<table class="rev-stmt">
					<tbody>
						{#each OPEX_ROWS as r (r.key)}
							<tr>
								<th><label for="opex-{r.key}">{r.label}</label>{#if r.note}<span class="meta"> {r.note}</span>{/if}</th>
								<td class="num">
									<input id="opex-{r.key}" name={r.key} type="number" min="0" step="1000" bind:value={draft[r.key]} />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="console-actions">
					<button type="submit" class="pri sm">비용 저장 · 재계산</button>
					<button type="submit" formaction="?/resetOpex" class="ghost sm">기본값</button>
					{#if dirty}<span class="meta">저장 전 — 아래 표는 입력값으로 계산됩니다</span>{/if}
				</div>
			</form>
		</section>

		<section class="console-card">
			<h4>비용 집계 → 최종 순이익</h4>
			{#if bd && pf}
				<table class="rev-stmt">
					<tbody>
						<tr><th>고정비 합계 (월)</th><td class="num">−{won(bd.fixed)}</td></tr>
						<tr><th class="in">알림톡 <span class="meta">{fmtNum(v.basis.orders)}건 × 3</span></th><td class="num">−{won(bd.kakao)}</td></tr>
						<tr><th class="in">Claude API <span class="meta">{fmtNum(v.basis.sellers)}명 × 30일 + 추론 {fmtNum(v.basis.inferences)}건</span></th><td class="num">−{won(bd.claude)}</td></tr>
						<tr><th class="in">PG 고정비</th><td class="num">−{won(bd.pgFixed)}</td></tr>
						<tr><th class="in">샘플 셀러리 결제 보전 <span class="meta">🥬로 낸 샘플값을 브랜드에 원화 지급</span></th><td class="num">−{won(bd.celCover)}</td></tr>
						<tr class="sum"><th>운영 비용 합계</th><td class="num">−{won(bd.total)}</td></tr>
						<tr><th>플랫폼 순수익 (VAT 제외)</th><td class="num">{won(v.totals.platform_net)}</td></tr>
						<tr class="tot"><th>운영비 차감 최종 순이익</th><td class="num" class:down={pf.finalNet < 0}>{pf.finalNet < 0 ? '−' : ''}{won(Math.abs(pf.finalNet))}</td></tr>
						<tr><th>손익분기 월 GMV <span class="meta">운영비 ÷ 순 테이크레이트 {pct(pf.takeRate)}</span></th><td class="num">{pf.breakEvenGmv === null ? '—' : won(pf.breakEvenGmv)}</td></tr>
						<tr><th>운영비율 (운영비 ÷ GMV)</th><td class="num">{pct(pf.opexRatio)}</td></tr>
					</tbody>
				</table>
			{/if}
			<p class="meta">
				PG 1.9% 는 브랜드 정산에서 차감되는 통과 비용이라 위 순수익에 이미 반영됩니다(플랫폼 부담 아님).
				운영비는 월 단위 추정치이고 확정 매출은 누적 기준이라, 실제 월 손익과는 다릅니다.
			</p>
		</section>
	</div>

	<!-- 5. 판매별 손익 -->
	<section class="console-card">
		<h4>판매별 손익 <span class="meta">{fmtNum(v.rows.length)}건</span></h4>
		<div class="tblw admin-table">
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
						<tr>
							<td data-l="판매">
								{#if r.campaign_code}
									<a href="{data.campaignsPath}/{encodeURIComponent(r.campaign_code)}">{r.product_name ?? r.campaign_code}</a>
								{:else}
									{r.product_name ?? '—'}
								{/if}
								{#if r.seller_handle}<span class="meta"> {r.seller_handle}</span>{/if}
								{#if r.samplePending}<span class="meta"> · 샘플 구매만 — 브랜드 지급 규칙 미정</span>{/if}
							</td>
							<td class="num" data-l="확정 매출">{unknown ? '—' : won(r.net)}</td>
							<td class="num" data-l="PG">{unknown ? '—' : won(r.pg_fee)}</td>
							<td class="num" data-l="인플루언서">{unknown ? '—' : won(r.seller_fee_total)}</td>
							<td class="num" data-l="브랜드">{unknown ? '—' : won(r.brand_payout)}</td>
							<td class="num" data-l="수수료">{unknown ? '—' : won(r.platform_fee_gross)}</td>
							<td class="num" data-l="보상·할인">{unknown ? '—' : `−${won(r.costs)}`}</td>
							<td class="num" data-l="VAT">{unknown ? '—' : `−${won(r.vat)}`}</td>
							<td class="num" data-l="순수익"><b>{unknown ? '—' : won(r.platform_net)}</b></td>
							<td data-l="상태"><span class="st {chip.tone}">{chip.label}</span></td>
						</tr>
					{:else}
						<tr><td colspan="10" class="empty">확정 매출이 있는 판매가 없습니다</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if v.counts.no_snapshot}
			<p class="meta">— 표시된 건은 정산 명세가 없어 금액을 계산할 수 없습니다(정산 실행 시 생성됩니다).</p>
		{/if}
	</section>
{/if}

<style>
	.rev-kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}
	.rev-kpi {
		border: 1.5px solid var(--color-line);
		padding: 12px 14px;
	}
	.rev-kpi .l {
		display: block;
		font-size: 0.8rem;
	}
	.rev-kpi .v {
		display: block;
		font-size: 1.4rem;
		line-height: 1.2;
		margin: 2px 0;
	}
	.rev-kpi .meta {
		display: block;
	}

	.rev-2col {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}

	/* 손익 계산서 — 항목/금액 두 칸 */
	.rev-stmt {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}
	.rev-stmt th {
		text-align: left;
		font-weight: 400;
		padding: 5px 0;
	}
	.rev-stmt td {
		padding: 5px 0;
		white-space: nowrap;
	}
	.rev-stmt tr + tr th,
	.rev-stmt tr + tr td {
		border-top: 1px solid var(--color-line);
	}
	/* 들여쓴 하위 항목 */
	.rev-stmt th.in {
		padding-left: 12px;
	}
	.rev-stmt .sum th,
	.rev-stmt .sum td {
		font-weight: 700;
	}
	.rev-stmt .tot th,
	.rev-stmt .tot td {
		font-weight: 700;
		border-top-width: 2px;
	}
	.rev-stmt input {
		width: 108px;
		text-align: right;
	}
	.down {
		color: var(--color-danger, #c0392b);
	}
</style>
