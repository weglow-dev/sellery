<script lang="ts">
	/**
	 * 정산 실행 — 프로토타입 vAdminSettle(실행 가능 n건 · 대기 n건 · [일괄 정산] · 대기 목록 "확정 → 브랜드 + 인플루언서 · 정산 기준일" · 정산 완료 표) 의 DB 판.
	 *   상단 띠: 기준일 도래 CLEARING · 지급 보류 건 · 미지급 합계(payouts pending) · 정산 명세 건수.
	 *   [도래분 일괄 실행] `?/runDue`(confirm) → 건별 결과(settleRunSummary) 를 아래 notice 목록으로.
	 *   대기 큐 표: 캠페인 · 인플루언서 · 브랜드 · 종료/기준일(dueLabel) · 예상 인플/브랜드 지급 · 보류 예고 · [미리보기] → /settle/[code].
	 *   정산 명세 표(`?status=`): 스냅샷 행 → /settle/[code]. 375px 는 카드 모드(.admin-table).
	 */
	import { dueLabel, settlementStatusChip } from '@sellery/db/admin/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const d = $derived(data.data);
	const money = (n: number) => `₩${fmtNum(n)}`;
	const detail = (code: string) => `${data.self}/${encodeURIComponent(code)}`;
	const confirmRunDue = (e: SubmitEvent) => {
		const n = d?.counts.due_now ?? 0;
		if (!confirm(`기준일이 도래한 ${n}건을 지금 정산할까요? 스냅샷 · 지급 2건 · 등급 · 🥬 · 추천 보상이 한 번에 기록되며 되돌릴 수 없어요.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>정산 실행 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>정산 실행</h2>
	{#if d?.counts.due_now}<span class="badge">도래 {d.counts.due_now}</span>{/if}
	<span class="meta">판매 종료 D+21 도래분만 실행 · 개별 실행·강제 실행은 미리보기에서</span>
	<a href={data.payoutsPath} class="btn ghost sm" style="margin-left:auto">지급 관리 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !d}
	<p class="notice danger" role="status">정산 데이터를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else}
	<div class="mini-stats admin-strip" style="margin-top:0">
		<div><span class="ms-l">기준일 도래 (실행 가능)</span><span class="ms-v" style={d.counts.due_now ? 'color:var(--color-danger)' : ''}>{d.counts.due_now}건</span><span class="ms-s">교환·환불 기간 {d.counts.clearing}건 중 · 오늘 {md(d.today)}</span></div>
		<div><span class="ms-l">지급 보류</span><span class="ms-v" style={d.counts.payouts_held ? 'color:var(--color-danger)' : ''}>{d.counts.payouts_held}건</span><span class="ms-s">정산 정보 미완비 · 운영자 보류</span></div>
		<div><span class="ms-l">미지급 합계</span><span class="ms-v" style="color:var(--color-plat)">{money(d.counts.payouts_pending_amount)}</span><span class="ms-s">지급 대기 {d.counts.payouts_pending}건</span></div>
		<div><span class="ms-l">정산 명세</span><span class="ms-v">{d.counts.pending + d.counts.held + d.counts.paid}건</span><span class="ms-s">대기 {d.counts.pending} · 보류 {d.counts.held} · 완료 {d.counts.paid}</span></div>
	</div>

	<!-- ---------------- 도래분 일괄 실행 ---------------- -->
	<section class="card static admin-run">
		<div class="admin-run-head">
			<div>
				<b>도래분 일괄 실행</b>
				<span class="meta">기준일(종료일 + 21일)이 오늘 이하인 교환·환불 기간 캠페인 전부 — 건별 한 트랜잭션, 이미 정산된 건은 건너뜁니다.</span>
			</div>
			<form method="post" action="?/runDue" onsubmit={confirmRunDue}>
				<button type="submit" class="pri sm" disabled={!d.counts.due_now}>도래분 일괄 실행 ({d.counts.due_now})</button>
			</form>
		</div>
		{#if form?.kind === 'runDue'}
			{#if form.message}
				<p class="notice danger" role="alert" style="margin:12px 0 0">{form.message}</p>
			{:else}
				<p class={`notice ${form.failed ? '' : 'ok'}`} role="status" style="margin:12px 0 0">대상 {form.count}건 · 정산 {form.settled}건 · 실패 {form.failed}건{#if !form.count} — 기준일이 도래한 캠페인이 없어요{/if}</p>
				{#if form.results.length}
					<ul class="admin-results">
						{#each form.results as r (r.code)}
							<li class={r.ok ? 'ok' : 'bad'}><a href={detail(r.code)} class="console-mono">{r.code.toUpperCase()}</a> {r.line}</li>
						{/each}
					</ul>
				{/if}
			{/if}
		{/if}
	</section>

	<!-- ---------------- 대기 큐 ---------------- -->
	<div class="sec">정산 대기 (교환 · 환불 기간) <span class="console-sec-sub">— 지금 기준 예상값 · 실행 시점에 다시 계산됩니다</span></div>
	<div class="tblw admin-table admin-queue">
		<table>
			<thead>
				<tr><th>캠페인</th><th>인플루언서</th><th>브랜드</th><th>종료 · 기준일</th><th class="num">순매출</th><th class="num">인플루언서 지급</th><th class="num">브랜드 지급</th><th>보류 예고</th><th></th></tr>
			</thead>
			<tbody>
				{#each d.queue as q (q.campaign_id)}
					<tr class={q.eligible ? 'row-due' : ''}>
						<td data-l="캠페인">
							<a href={detail(q.campaign_code)} class="console-cell-prod">
								{#if q.product}<ProductIcon thumbUrl={q.product.thumb_url} emoji={q.product.emoji} size={22} />{/if}
								<span><b>{q.product?.name ?? q.title ?? q.campaign_code}</b><small>{q.campaign_code.toUpperCase()} · 주문 {q.paid_count}{q.refund_count ? ` · 환불 ${q.refund_count}` : ''}</small></span>
							</a>
						</td>
						<td data-l="인플루언서">{q.seller?.name ?? '—'}<small>{q.seller?.handle ?? ''}{q.seller?.grade ? ` · ${q.seller.grade}` : ''}</small></td>
						<td data-l="브랜드">{q.brand?.name ?? '—'}<small>{q.brand?.grade ?? ''}</small></td>
						<td data-l="종료 · 기준일" class="console-mono">{q.end_date ? md(q.end_date) : '—'}<small class={q.eligible ? 'console-danger' : ''}>{dueLabel(q.due_on, d.today)}</small></td>
						<td class="num" data-l="순매출">{money(q.net)}</td>
						<td class="num" data-l="인플루언서 지급">{money(q.seller_payout)}<small>세전 {money(q.seller_fee_total)} − 원천징수 {money(q.seller_wht)}</small></td>
						<td class="num" data-l="브랜드 지급" style="color:var(--color-plat);font-weight:700">{money(q.brand_payout)}</td>
						<td data-l="보류 예고">
							{#if q.holds.seller}<StatusChip tone="red" title={q.holds.seller.label}>인플 보류</StatusChip>{/if}
							{#if q.holds.brand}<StatusChip tone="red" title={q.holds.brand.label}>브랜드 보류</StatusChip>{/if}
							{#if !q.holds.seller && !q.holds.brand}<span class="meta">없음</span>{/if}
						</td>
						<td data-l="" class="admin-row-act"><a href={detail(q.campaign_code)} class="btn {q.eligible ? 'pri' : 'ghost'} sm">{q.eligible ? '실행 · 미리보기' : '미리보기'}</a></td>
					</tr>
				{:else}
					<tr><td colspan="9" class="empty">정산 대기 건이 없습니다 — 판매가 끝나 교환·환불 기간에 들어간 캠페인이 여기에 쌓여요</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- ---------------- 정산 명세 ---------------- -->
	<div class="sec" style="margin-top:22px">정산 명세 (완료) <span class="console-sec-sub">— 실행 시점 스냅샷 · 지급 상태</span></div>
	<nav class="cats console-filters" aria-label="정산 상태 필터">
		{#each data.chips as f (f.key)}
			<a href={f.href} class="catchip {(data.status ?? '') === f.key ? 'on' : ''}" aria-current={(data.status ?? '') === f.key ? 'page' : undefined}>{f.label}</a>
		{/each}
	</nav>
	<div class="tblw admin-table">
		<table>
			<thead>
				<tr><th>정산일</th><th>캠페인</th><th>인플루언서 · 브랜드</th><th class="num">순매출</th><th class="num">인플루언서 지급</th><th class="num">브랜드 지급</th><th class="num">플랫폼 순수익</th><th>상태</th></tr>
			</thead>
			<tbody>
				{#each d.rows as r (r.settlement_id ?? r.campaign_id)}
					{@const st = settlementStatusChip(r.settlement?.status ?? null)}
					<tr>
						<td class="console-mono" data-l="정산일">{r.settlement?.settled_at ? md(r.settlement.settled_at) : '—'}</td>
						<td data-l="캠페인">
							<a href={detail(r.campaign_code)} class="console-cell-prod">
								{#if r.product}<ProductIcon thumbUrl={r.product.thumb_url} emoji={r.product.emoji} size={22} />{/if}
								<span><b>{r.product?.name ?? r.title ?? r.campaign_code}</b><small>{r.campaign_code.toUpperCase()}{r.end_date ? ` · 종료 ${md(r.end_date)}` : ''}</small></span>
							</a>
						</td>
						<td data-l="인플루언서 · 브랜드">{r.seller?.name ?? '—'}<small>{r.brand?.name ?? ''}</small></td>
						<td class="num" data-l="순매출">{money(r.net)}</td>
						<td class="num" data-l="인플루언서 지급">{money(r.seller_payout)}{#if r.payouts.seller}<small><StatusChip tone={r.payouts.seller.status === 'paid' ? 'green' : r.payouts.seller.status === 'held' ? 'red' : 'blue'}>{r.payouts.seller.status === 'paid' ? '지급 완료' : r.payouts.seller.status === 'held' ? '보류' : '대기'}</StatusChip></small>{/if}</td>
						<td class="num" data-l="브랜드 지급">{money(r.brand_payout)}{#if r.payouts.brand}<small><StatusChip tone={r.payouts.brand.status === 'paid' ? 'green' : r.payouts.brand.status === 'held' ? 'red' : 'blue'}>{r.payouts.brand.status === 'paid' ? '지급 완료' : r.payouts.brand.status === 'held' ? '보류' : '대기'}</StatusChip></small>{/if}</td>
						<td class="num" data-l="플랫폼 순수익" style="color:var(--color-accent)">{money(r.platform_net)}</td>
						<td data-l="상태"><StatusChip tone={st.tone}>{st.label}</StatusChip></td>
					</tr>
				{:else}
					<tr><td colspan="8" class="empty">{data.status ? '이 상태의 정산 명세가 없어요' : '아직 정산 명세가 없습니다'}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="meta" style="margin:8px 3px 0">인플루언서 지급 = 수수료 + 등급 보너스 + 추천 부스트 − 원천징수(개인 3.3%) + 샘플 환급 현금 · 브랜드 지급 = 순매출 − PG − 인플루언서 수수료 − 플랫폼 수수료(등급·추천 할인 반영) · 플랫폼 순수익은 부가세 제외. 계좌 원문은 화면에 없고 <a href={data.payoutsPath}>지급 관리</a>의 이체 파일에서만 내려받아요(열람 로그).</p>
{/if}
