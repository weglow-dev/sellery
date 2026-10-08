<script lang="ts">
	/**
	 * 정산 상세 — calc() 전 라인 명세표(settlement-policy §3 순서: 매출 → 취소/환불 → 순매출 → PG → 인플루언서 수수료(+보너스·부스트) → 플랫폼 수수료 총액 → 플랫폼 부담 → 플랫폼 수익/부가세/순수익 → 브랜드 지급 → 인플루언서 지급(원천징수) → 샘플 환급)
	 * · 보류 예고/사유 · [정산 실행] `?/run`(기준일 전이면 강제 체크 · confirm) · 실행 뒤 지급 카드 2장(인플루언서/브랜드 — 금액 · 상태 · 보류 사유 · [지급 완료] 메모 · [보류] 사유 · [보류 해제]) · 이벤트 목록.
	 * source: live(실시간 예상) · snapshot(정산 완료 스냅샷) · none(스냅샷 없는 이관 SETTLED — 시드 c6).
	 */
	import { dueLabel, payoutStatusChip, settlementStatusChip, type PayoutView, payeeTypeLabel, tossPayoutChip } from '@sellery/db/admin/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.preview);
	const money = (n: number) => `₩${fmtNum(n)}`;
	const pct = (r: number) => `${Number((r * 100).toFixed(2))}%`;
	const fmtTime = (iso: string | null) => (iso ? `${md(iso)} ${iso.length >= 16 ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}`.trim() : '—');
	const today = $derived(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
	const canRun = $derived(!!p && p.source === 'live' && p.campaign_status === 'CLEARING');
	/** 지급 완료가 하나라도 있으면 취소할 수 없다 — 나간 돈은 되돌릴 수 없다(0048) */
	const paidCount = $derived(
		[p?.payouts.seller, p?.payouts.brand, p?.payouts.referrer].filter((po) => po?.status === 'paid').length
	);
	const canCancel = $derived(!!p && p.campaign_status === 'SETTLED' && paidCount === 0);
	const confirmRun = (e: SubmitEvent) => {
		if (!p) return e.preventDefault();
		if (!confirm(`${p.campaign_code.toUpperCase()} 정산을 실행할까요?\n순매출 ${money(p.net)} → 브랜드 ${money(p.brand_payout)} · 인플루언서 ${money(p.seller_payout)}\n스냅샷 · 지급 2건 · 등급 · 🥬 · 추천 보상이 한 번에 기록됩니다.\n지급 전이면 취소할 수 있지만, 한 건이라도 지급하면 되돌릴 수 없어요.`)) e.preventDefault();
	};
	const EVENT_LABEL: Record<string, string> = {
		ended: '판매 종료',
		settled: '정산 완료',
		payout_held: '지급 보류',
		payout_released: '보류 해제(정보 등록)',
		payout_paid: '지급 완료',
		ref_reward: '추천 보상',
		brand_ref_reward: '브랜드 추천 보상',
		sample_refunded: '샘플 환급',
		refunded: '환불',
		refund_needs_adjust: '정산 후 환불 (조정 큐)'
	};
	const payeeLabel = payeeTypeLabel;
</script>

<svelte:head>
	<title>정산 {data.code.toUpperCase()} — 셀러리 관리자</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 정산 실행</a>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if form?.kind === 'run'}
	<p class={`notice ${form.ok ? 'ok' : 'danger'}`} role={form.ok ? 'status' : 'alert'}>{form.ok ? '정산 실행 완료 — ' : ''}{form.message}</p>
{/if}

{#if !p}
	<section class="card static">
		<div class="lbl-sm">정산 상세</div>
		<h2 class="console-title">{data.code.toUpperCase()}</h2>
		<p class="notice" role="status">{data.previewError?.message ?? '정산을 계산할 수 없는 상태예요'}{#if data.previewError?.status}{' '}(현재 상태 <span class="console-mono">{data.previewError.status}</span>){/if}</p>
		<p class="meta">샘플·일정 단계 캠페인은 정산 대상이 아니에요. 판매(LIVE)·교환·환불 기간(CLEARING)·정산 완료(SETTLED) 캠페인만 여기서 봅니다.</p>
	</section>
{:else}
	<!-- ---------------- 머리 ---------------- -->
	<section class="card static console-det">
		{#if p.product}<ProductIcon thumbUrl={p.product.thumb_url} emoji={p.product.emoji} size={52} />{/if}
		<div class="grow">
			<div class="t">{p.product?.name ?? p.title ?? p.campaign_code} <small>· {p.campaign_code.toUpperCase()}</small></div>
			<div class="meta">
				{p.seller?.name ?? '—'}{p.seller?.handle ? ` ${p.seller.handle}` : ''}{p.seller?.grade ? ` · ${p.seller.grade}` : ''} · {p.brand?.name ?? '—'}{p.brand?.grade ? ` (${p.brand.grade})` : ''}
				· {p.start_date ? md(p.start_date) : '—'}–{p.end_date ? md(p.end_date) : '—'} · 주문 {p.paid_count}{p.refund_count ? ` · 환불 ${p.refund_count}` : ''}
				· <a href={data.ordersPath}>주문 보기</a>
			</div>
		</div>
		<div class="admin-det-status">
			{#if p.source === 'snapshot'}
				{@const st = settlementStatusChip(p.settlement?.status ?? null)}
				<StatusChip tone={st.tone}>{st.label}</StatusChip>
				<small class="meta">정산 {fmtTime(p.settlement?.settled_at ?? null)}</small>
			{:else if p.source === 'none'}
				<StatusChip tone="gray">스냅샷 없음</StatusChip>
			{:else}
				<StatusChip tone={p.campaign_status === 'LIVE' ? 'live' : 'amber'}>{p.campaign_status === 'LIVE' ? '판매 중' : '교환 · 환불 기간'}</StatusChip>
				<small class="meta {p.eligible ? 'console-danger' : ''}">기준일 {dueLabel(p.due_on, today)}</small>
			{/if}
		</div>
	</section>

	{#if p.source === 'none'}
		<p class="notice" role="status">정산 완료 캠페인이지만 명세 스냅샷이 없어요(이관 데이터) — 금액은 표시하지 않습니다.</p>
	{:else}
		{#if p.source === 'live' && (p.holds.seller || p.holds.brand)}
			<div class="card static console-hold" role="status">
				<b>⚠ 지급 보류 예고</b>
				<span class="meta">
					{#if p.holds.seller}인플루언서: {p.holds.seller.label}{/if}{#if p.holds.seller && p.holds.brand} · {/if}{#if p.holds.brand}브랜드: {p.holds.brand.label}{/if}
					— 정산은 기록되고 지급만 보류됩니다. 파트너가 정산 정보를 등록하면 보류가 풀려 지급 대기가 되고, 관리자가 확인 후 다음 이체 때 지급합니다.
				</span>
			</div>
		{/if}

		<div class="console-det-body admin-det-body">
			<!-- ---------------- 명세표 ---------------- -->
			<section class="card static admin-stmt-card">
				<h4>정산 명세 <span class="console-sec-sub">— {p.source === 'snapshot' ? '실행 시점 스냅샷' : '지금 기준 예상 · 실행 시점에 다시 계산'}</span></h4>
				<div class="tblw admin-stmt">
					<table class="stmt">
						<tbody>
							<tr><td>매출 (취소 제외 · 샘플 구매 포함)</td><td class="num">{money(p.gross)}</td></tr>
							<tr><td>취소 · 환불{#if p.partial_refunds}<small>부분취소 {money(p.partial_refunds)} 포함</small>{/if}</td><td class="num">−{money(p.refunds)}</td></tr>
							<tr class="tot"><td>순매출 (확정 매출)</td><td class="num">{money(p.net)}</td></tr>
							{#if p.sample_net}<tr><td>└ 인플루언서 본인 샘플 구매분 <small>수수료 · 보너스 계산에서 제외</small></td><td class="num">{money(p.sample_net)}</td></tr>{/if}
							<tr><td>PG 수수료 <small>{pct(p.pg_rate)} · 브랜드 정산에서 차감</small></td><td class="num">−{money(p.pg_fee)}</td></tr>
							<tr><td>인플루언서 수수료 <small>{pct(p.seller_rate)}{p.ref_boost_applied ? ' · 추천 부스트 적용' : ''}</small></td><td class="num">−{money(p.seller_fee)}</td></tr>
							<tr><td>└ 등급 보너스 <small>{p.seller_grade ?? '—'} +{p.seller_bonus_pp}%p · 플랫폼 부담</small></td><td class="num">+{money(p.seller_bonus)}</td></tr>
							{#if p.ref_boost_applied}<tr><td>└ 추천 부스트 <small>+{pct(p.ref_boost_rate)}p · 첫 5회 · 플랫폼 부담</small></td><td class="num">+{money(p.ref_boost)}</td></tr>{/if}
							<tr class="tot"><td>인플루언서 수수료 합계 (세전)</td><td class="num">{money(p.seller_fee_total)}</td></tr>
							<tr><td>플랫폼 수수료 총액 <small>{pct(p.platform_rate)}</small></td><td class="num">{money(p.platform_fee_gross)}</td></tr>
							<tr><td>플랫폼 부담 <small>보너스 {money(p.seller_bonus)}{p.ref_boost_applied ? ` · 부스트 ${money(p.ref_boost)} · 추천 보상 ${money(p.ref_reward)}` : ''}{p.brand_ref_applied ? ` · 브랜드 추천 할인 ${money(p.brand_ref_boost)} · 보상 ${money(p.brand_ref_reward)}` : ''}{p.brand_discount ? ` · 브랜드 등급 할인 ${money(p.brand_discount)}(${p.brand_grade ?? ''} −${pct(p.brand_discount_rate)}p)` : ''}</small></td><td class="num">−{money(p.costs)}</td></tr>
							<tr><td>플랫폼 수익</td><td class="num">{money(p.platform_fee)}</td></tr>
							<tr><td>└ 부가세</td><td class="num">−{money(p.vat)}</td></tr>
							<tr class="tot"><td>플랫폼 순수익</td><td class="num" style="color:var(--color-accent)">{money(p.platform_net)}</td></tr>
							<tr class="tot"><td>브랜드 지급 <small>순매출 − PG − 인플루언서 수수료 − 플랫폼 수수료 + 할인</small></td><td class="num" style="color:var(--color-plat)">{money(p.brand_payout)}</td></tr>
							<tr><td>원천징수 <small>{p.seller?.settle_type === 'biz' ? '사업자 · 세금계산서 (0%)' : `개인 ${pct(p.wht_rate)}`}</small></td><td class="num">−{money(p.seller_wht)}</td></tr>
							{#if p.sample_refund_cash || p.sample_refund_cel}<tr><td>샘플 환급 <small>상품 환급 옵션 · 🥬{p.sample_refund_cel} 는 원장 복원 · 현금은 지급액 가산</small></td><td class="num">+{money(p.sample_refund_cash)}</td></tr>{/if}
							{#if p.sample_refund_cash}<tr><td class="in">└ 환급 재원 <small>브랜드 몫·플랫폼 수수료에서 차감 · 카드 수수료와 추천인 보상은 플랫폼 부담 (0023)</small></td><td class="num">브랜드 −{money(p.sample_refund_brand)} · 플랫폼 −{money(p.sample_refund_platform)} · 카드 {money(p.sample_refund_pg)}</td></tr>{/if}
							<tr class="tot"><td>인플루언서 지급 (실수령)</td><td class="num" style="color:var(--color-seller)">{money(p.seller_payout)}</td></tr>
							{#if p.sample_cel_cover}<tr><td>🥬 결제분 브랜드 원화 보전 <small>플랫폼 비용</small></td><td class="num">{money(p.sample_cel_cover)}</td></tr>{/if}
						</tbody>
					</table>
				</div>
			</section>

			<div class="console-actions">
				<!-- ---------------- 실행 ---------------- -->
				{#if p.source === 'live'}
					<div class="card static">
						<h4>정산 실행</h4>
						{#if canRun}
							<!--
								기일 전 강제 실행 체크박스를 **제거했다**(2026-10-08 · 운영 결정).
								D+21 은 교환·환불 기간이고 정책에 예외 조항이 없다(docs/settlement-policy.md §8) —
								그 전에 정산하면 고객이 환불할 수 있는 돈을 지급하게 되고, 환불이 들어오면
								`refund_needs_adjust` 가 서는데 그걸 처리하는 조정 액션이 아직 없다.
								프로토타입에도 강제 실행은 없었다 — 데모는 시뮬레이션 블록의 "⏩ 3주 경과" 로
								`end_date` 를 당겼다(`core/actions.ts` ffwd). 그걸 실서비스로 옮길 때 가드를 끄는
								플래그가 된 것이고, 설계 결정으로 기록된 적은 없다.
								지급 리허설(launch-checklist §8-13)은 운영 스크립트로 한다 —
								`partner-admin.mjs settle-run <c> --force --reason "지급 리허설"`(사유가 명세에 남는다).
							-->
							{#if p.eligible}
								<p class="hint">기준일이 도래했어요 — 실행하면 위 명세가 스냅샷으로 고정되고 지급 2건이 만들어집니다.</p>
								<form method="post" action="?/run" onsubmit={confirmRun}>
									<div class="btnrow"><button type="submit" class="pri sm">정산 실행</button></div>
								</form>
							{:else}
								<p class="hint">
									기준일 <b>{p.due_on ? md(p.due_on) : '미정'}</b> 전이에요 — 교환·환불 기간이 끝나기 전에는 정산할 수 없습니다.
									고객이 환불할 수 있는 돈이라 기일까지 셀러리가 보관합니다.
								</p>
							{/if}
						{:else if p.campaign_status === 'SETTLED'}
							<!--
								미지급 정산 취소(0048) — 돈이 한 푼도 안 나갔을 때만. 지급 완료가 있으면 버튼을 두지 않는다
								(RPC 도 HAS_PAID 로 막는다). 이미 보낸 뒤의 정정은 만들지 않았다 — 회계 정책 결정이 필요하다.
							-->
							{#if canCancel}
								<p class="hint">
									정산이 확정됐지만 <b>아직 지급된 돈이 없어</b> 취소할 수 있어요. 취소하면 명세·지급 건이 지워지고
									교환/환불 기간으로 돌아갑니다 — 기일이 되면 다시 실행하면 됩니다.
								</p>
								<form
									method="post"
									action="?/cancelSettle"
									class="console-form"
									onsubmit={(e) => {
										if (!confirm('정산을 취소할까요?\n명세와 지급 건이 지워지고 교환/환불 기간으로 돌아갑니다.')) e.preventDefault();
									}}
								>
									<input type="text" name="reason" required maxlength="200" placeholder="취소 사유 (필수 · 캠페인 스레드에 남아요)" aria-label="취소 사유" />
									<div class="btnrow"><button type="submit" class="danger sm">정산 취소</button></div>
								</form>
							{:else}
								<p class="hint">
									지급이 <b>{paidCount}건</b> 완료돼 정산을 취소할 수 없어요 — 이미 나간 돈은 되돌릴 수 없습니다.
									금액이 잘못됐다면 운영팀과 조정 절차로 처리해주세요.
								</p>
							{/if}
						{:else}
							<p class="hint">판매 중(LIVE) 캠페인은 종료 후 교환·환불 기간(D+21)이 지나야 정산할 수 있어요. 스케줄러가 종료일 다음 날 CLEARING 으로 옮깁니다.</p>
						{/if}
					</div>
				{/if}

				<!-- ---------------- 지급 ---------------- -->
				{#if p.source === 'snapshot'}
					<div id="payouts">
						{#each [p.payouts.seller, p.payouts.brand, p.payouts.referrer] as po (po?.id ?? Math.random())}
							{#if po}
								{@const chip = payoutStatusChip(po.status)}
								<div class="card static admin-payout">
									<h4>{payeeLabel(po.payee_type)} 지급 <StatusChip tone={chip.tone}>{chip.label}</StatusChip></h4>
									<dl class="console-kv">
										<dt>금액</dt><dd><b>{money(po.amount)}</b>{#if po.wht}{' '}<span class="meta">(원천징수 {money(po.wht)} 차감 후)</span>{/if}</dd>
										<dt>계좌</dt><dd>{#if po.bank_snapshot?.bank}{po.bank_snapshot.bank} <span class="console-mask">{po.bank_snapshot.account_masked ?? ''}</span> · {po.bank_snapshot.holder ?? ''}{:else}<span class="meta">미등록</span>{/if}</dd>
										{#if po.status === 'held'}<dt>보류 사유</dt><dd class="console-danger">{po.hold_reason ?? (po.hold_code ? data.holdLabels[po.hold_code as keyof typeof data.holdLabels] ?? po.hold_code : '운영자 보류')}</dd>{/if}
										{#if po.paid_at}<dt>지급일</dt><dd>{fmtTime(po.paid_at)}</dd>{/if}
										{#if po.memo}<dt>메모</dt><dd>{po.memo}</dd>{/if}
										{#if po.toss_payout_status}
											{@const tchip = tossPayoutChip(po.toss_payout_status)}
											<dt>토스 지급대행</dt>
											<dd>{#if tchip}<StatusChip tone={tchip.tone}>{tchip.label}</StatusChip>{/if} <span class="console-mono">{po.toss_payout_id ?? ''}</span>{#if po.toss_schedule_date}{' '}· 예정 {po.toss_schedule_date}{/if}{#if po.toss_error?.message}<small class="console-danger"> · {po.toss_error.message}</small>{/if}</dd>
										{/if}
									</dl>
									{#if po.status === 'pending'}
										<form method="post" action="?/paid" class="console-form admin-inline-form" onsubmit={(e) => { if (!confirm(`${payeeLabel(po.payee_type)} ${money(po.amount)} 을 지급 완료로 표시할까요? 실제 이체를 마친 뒤에만 눌러주세요.`)) e.preventDefault(); }}>
											<input type="hidden" name="payout_id" value={po.id} />
											<input name="memo" maxlength={200} placeholder="메모 (선택 · 이체 일자 · 배치명)" aria-label="지급 메모" />
											<button type="submit" class="pri sm">지급 완료</button>
										</form>
										<form method="post" action="?/hold" class="console-form admin-inline-form">
											<input type="hidden" name="payout_id" value={po.id} />
											<input name="reason" maxlength={200} placeholder="보류 사유 (선택)" aria-label="보류 사유" />
											<button type="submit" class="ghost sm">보류</button>
										</form>
									{:else if po.status === 'held'}
										<form method="post" action="?/release" class="admin-inline-form">
											<input type="hidden" name="payout_id" value={po.id} />
											<button type="submit" class="pri sm">보류 해제</button>
											<span class="hint" style="margin:0">정산 정보가 완비됐는지 다시 검사해요 — 미완비면 해제되지 않아요.</span>
										</form>
									{/if}
								</div>
							{/if}
						{/each}
						{#if !p.payouts.seller && !p.payouts.brand && !p.payouts.referrer}
							<div class="card static"><h4>지급</h4><p class="hint">지급 건이 없어요.</p></div>
						{/if}
					</div>
				{/if}

				<!-- ---------------- 파트너 정보 ---------------- -->
				<div class="card static">
					<h4>파트너 정산 정보</h4>
					<dl class="console-kv">
						<dt>인플루언서</dt><dd>{p.seller?.name ?? '—'} <span class="meta">{p.seller?.settle_type === 'biz' ? '사업자' : '개인'}{#if p.seller?.has_bank_info !== null}{' '}· 계좌 {p.seller?.has_bank_info ? '등록' : '미등록'}{/if}{#if p.seller?.settle_type !== 'biz' && p.seller?.has_rrn !== null}{' '}· 주민번호 {p.seller?.has_rrn ? '등록' : '미등록'}{/if}</span></dd>
						<dt>브랜드</dt><dd>{p.brand?.name ?? '—'} <span class="meta">{p.brand?.settle_info_complete === null ? '정산 정보는 지급 카드의 계좌로' : `정산 정보 ${p.brand?.settle_info_complete ? '완비' : '미완비'}`}</span></dd>
					</dl>
				</div>
			</div>
		</div>
	{/if}

	<!-- ---------------- 이벤트 ---------------- -->
	<div class="sec" style="margin-top:18px">이벤트 <span class="console-sec-sub">— 캠페인 스레드에 남은 정산·지급 기록</span></div>
	<div class="listcard admin-events">
		{#each data.events as e (e.id)}
			<div class="rowitem">
				<span class="chip {e.event_type === 'payout_held' || e.event_type === 'refund_needs_adjust' ? 'auto' : 'plat'}">{EVENT_LABEL[e.event_type ?? ''] ?? e.event_type ?? '—'}</span>
				<div class="grow"><div class="sub">{e.body}</div></div>
				<span class="console-mono meta">{fmtTime(e.created_at)}</span>
			</div>
		{:else}
			<div class="empty" style="padding:18px">이벤트 없음</div>
		{/each}
	</div>
{/if}

<style>
	/* 기준일 전 강제 실행 사유 (0048) */
	.settle-force-reason {
		display: block;
		width: 100%;
		margin: 8px 0 0;
	}
</style>
