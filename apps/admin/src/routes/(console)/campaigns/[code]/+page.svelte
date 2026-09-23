<script lang="ts">
	/**
	 * 관리자 캠페인 상세 — 데모 CampaignDetail · 인플루언서/브랜드 콘솔과 같은 console-det 톤.
	 *   머리 · 스테퍼 · 스레드(시스템/대화) · 우측 브랜드 대행 액션 · 정산 미리보기.
	 * 발신은 "셀러리 운영팀" — 브랜드 위장 발신은 하지 않는다.
	 */
	import { enhance } from '$app/forms';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { senderLabel } from '@sellery/db/partner/chat-rules';
	import { adminCampaignAction, campaignPeriodLabel, campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { COURIERS } from '@sellery/db/brand/campaign-rules';
	import { CampaignStepper, PlatformHandle, ProductIcon, StatusChip, ThreadComposer } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const c = $derived(data.campaign);
	const p = $derived(c.product);
	const chip = $derived(campaignStatusChip(c.status));
	const action = $derived(adminCampaignAction(c.status));
	const names = $derived({ seller: c.seller?.name ?? null, brand: c.brand?.name ?? null });
	const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₩${fmtNum(n)}`);
	const pct = (r: number | null | undefined) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(0)}%`);

	const MSG: Record<string, { tone: 'ok' | 'danger'; text: string }> = {
		sample_approved: { tone: 'ok', text: '샘플 요청을 승인했습니다 — 배송지가 브랜드에 전달됩니다.' },
		sample_rejected: { tone: 'ok', text: '샘플 요청을 거절했습니다.' },
		sample_already: { tone: 'ok', text: '이미 처리된 요청입니다.' },
		shipped: { tone: 'ok', text: '샘플 발송을 등록했습니다.' },
		ship_already: { tone: 'ok', text: '이미 발송 등록된 샘플입니다.' },
		schedule_confirmed: { tone: 'ok', text: '판매 일정을 확정했습니다 — 판매 링크가 만들어집니다.' },
		schedule_rejected: { tone: 'ok', text: '판매 일정을 거절했습니다.' },
		schedule_already: { tone: 'ok', text: '이미 처리된 일정입니다.' },
		sent: { tone: 'ok', text: '메시지를 보냈습니다 — 셀러리 운영팀으로 표시됩니다.' },
		sent_leak: { tone: 'danger', text: '메시지를 보냈지만 연락처·외부 메신저 공유로 감지되어 경고가 함께 남았습니다.' },
		err_NOT_FOUND: { tone: 'danger', text: '대상을 찾을 수 없습니다.' },
		err_WRONG_STATUS: { tone: 'danger', text: '현재 상태에서는 할 수 없는 동작입니다 — 화면을 새로 고쳐주세요.' },
		err_PERIOD_BLOCKED: { tone: 'danger', text: '같은 기간에 우선권 인플루언서가 이미 진입해 확정할 수 없습니다.' },
		err_DB_ERROR: { tone: 'danger', text: '처리에 실패했습니다. 잠시 후 다시 시도해주세요.' }
	};
	const msg = $derived(data.msg ? (MSG[data.msg] ?? { tone: 'danger' as const, text: `처리 결과: ${data.msg}` }) : null);
</script>

<svelte:head>
	<title>{p?.name ?? c.code} 캠페인 — 셀러리 관리자</title>
</svelte:head>

<a href={data.paths.home} class="btn ghost sm camp-back">← 대시보드</a>

{#if msg}
	<p class={`notice ${msg.tone === 'danger' ? 'danger' : 'ok'}`} role="status">{msg.text}</p>
{/if}

<section class="card static console-det">
	{#if p}
		<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji ?? '📦'} size={52} />
	{/if}
	<div class="grow">
		<div class="t">
			{#if p?.code}
				<a href="{data.paths.products}/{encodeURIComponent(p.code)}" class="camp-title-link">{p.name}</a>
			{:else}
				{p?.name ?? '—'}
			{/if}
			{#if c.code}<small>· {c.code.toUpperCase()}</small>{/if}
		</div>
		<div class="meta">
			{#if c.brand}
				<span class="chip brand">
					{#if c.brand.code}
						<a href="{data.paths.brands}/{encodeURIComponent(c.brand.code)}">{c.brand.name}</a>
					{:else}
						{c.brand.name}
					{/if}
				</span>
			{/if}
			×
			{#if c.seller}
				<span class="chip seller">
					{#if c.seller.code}
						<a href="{data.paths.sellers}/{encodeURIComponent(c.seller.code)}">
							{#if c.seller.platform}
								<PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} />
							{:else}
								{c.seller.name} {c.seller.handle}
							{/if}
						</a>
					{:else if c.seller.platform}
						<PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} />
					{:else}
						{c.seller.name} {c.seller.handle}
					{/if}
				</span>
			{/if}
			· 판매가 {money(p?.sale_price)}
			{#if p?.consumer_price && p.sale_price !== null && p.consumer_price > p.sale_price}
				<s class="camp-strike">{money(p.consumer_price)}</s>
			{/if}
			· 수수료 {pct(c.commission_rate)}
			{#if c.start_date} · 기간 {campaignPeriodLabel(c.start_date, c.end_date)}{/if}
			{#if c.auto} · 자동 제안{:else if c.invited} · 브랜드 제안{/if}
			{#if c.qty !== null} · 재고 {fmtNum(c.qty)}{/if}
			{#if c.sold_qty} · 판매 {fmtNum(c.sold_qty)}{/if}
		</div>
		<CampaignStepper status={c.status} />
	</div>
	<div class="admin-det-status">
		<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
	</div>
</section>

<div class="console-det-body admin-det-body">
	<section class="card static console-thread" aria-label="캠페인 스레드">
		<div class="msgs">
			{#each c.events as e (e.id)}
				{#if e.kind === 'system'}
					{#if e.leak_flag || e.event_type === 'leak_warned'}
						<div class="warnline">⚠ {e.body} · {md(e.created_at)}</div>
					{:else}
						<div class="sysline">{e.body} · {md(e.created_at)}</div>
					{/if}
				{:else}
					<div class="msg {e.sender}" class:leak={e.leak_flag}>
						<div class="who">{senderLabel(e.sender, names)}</div>
						{e.body}
						<div class="tm">
							{md(e.created_at)}
							{#if e.leak_flag} · 연락처 공유 감지{/if}
							{#if e.actor_role && e.actor_role !== e.sender} · 실제 발신 {e.actor_role}{/if}
						</div>
					</div>
				{/if}
			{:else}
				<div class="sysline">대화가 없습니다</div>
			{/each}
		</div>
		<ThreadComposer
			action="?/postChat"
			as="셀러리 운영팀"
			placeholder="메시지 입력… (승인·일정은 오른쪽 버튼으로)"
			error={form?.chatError ?? null}
		/>
	</section>

	<div class="console-actions">
		{#if action.kind !== 'none'}
			<div class="card static">
				<h4>{action.label} <span class="chip brand">브랜드 대행</span></h4>
				<p class="hint">{action.hint}</p>

				{#if action.kind === 'approve_sample'}
					{#if c.seller}
						<p class="hint">
							{#if c.seller.platform}
								<PlatformHandle platform={c.seller.platform} handle={c.seller.handle} name={c.seller.name} />
							{:else}
								{c.seller.name} {c.seller.handle}
							{/if}
							{#if c.seller.followers} · 팔로워 {fmtNum(c.seller.followers)}{/if}
							{#if c.seller.grade} · 등급 {c.seller.grade}{/if}
						</p>
					{/if}
					<div class="btnrow">
						<form method="POST" action="?/approveSample" use:enhance>
							<button type="submit" class="pri sm">승인</button>
						</form>
						<form method="POST" action="?/rejectSample" use:enhance class="camp-reason">
							<input name="reason" type="text" maxlength="200" placeholder="거절 사유 (선택)" aria-label="거절 사유" />
							<button type="submit" class="ghost sm">거절</button>
						</form>
					</div>
				{:else if action.kind === 'ship_sample'}
					<form method="POST" action="?/shipSample" use:enhance class="camp-ship console-form">
						<label for="courier">택배사</label>
						<select id="courier" name="courier" required>
							{#each COURIERS as k (k)}<option value={k}>{k}</option>{/each}
						</select>
						<label for="tracking_no">운송장 번호</label>
						<input id="tracking_no" name="tracking_no" type="text" maxlength="30" required placeholder="예: 6890-1234-5678" />
						<button type="submit" class="pri sm">발송 등록</button>
					</form>
					{#if form?.shipError}<p class="notice danger" role="alert">{form.shipError}</p>{/if}
				{:else if action.kind === 'confirm_schedule'}
					<p class="hint">
						제안된 기간 <b>{campaignPeriodLabel(c.start_date, c.end_date)}</b>
						{#if c.qty !== null} · 재고 {fmtNum(c.qty)}{/if}
					</p>
					<div class="btnrow">
						<form method="POST" action="?/confirmSchedule" use:enhance>
							<button type="submit" class="pri sm">일정 확정</button>
						</form>
						<form method="POST" action="?/rejectSchedule" use:enhance class="camp-reason">
							<input name="reason" type="text" maxlength="200" placeholder="거절 사유 (선택)" aria-label="거절 사유" />
							<button type="submit" class="ghost sm">거절</button>
						</form>
					</div>
				{/if}
			</div>
		{:else}
			<div class="card static">
				<h4>지금 할 일 없음</h4>
				<p class="hint">
					이 단계에서는 브랜드 대행 액션이 없습니다. 인플루언서 차례(수령·일정 제안)이거나 이미 끝난 단계입니다.
				</p>
			</div>
		{/if}

		<div class="card static">
			<h4>정산 미리보기</h4>
			{#if !c.preview}
				<p class="hint">판매가 시작되면 계산됩니다.</p>
			{:else}
				{@const prev = c.preview}
				<table class="camp-stmt">
					<tbody>
						<tr><td>결제 {fmtNum(prev.paid_count)}건</td><td class="num">{money(prev.gross)}</td></tr>
						<tr><td>환불 {fmtNum(prev.refund_count)}건</td><td class="num">−{money(prev.refunds)}</td></tr>
						<tr class="tot"><td><b>확정 매출</b></td><td class="num"><b>{money(prev.net)}</b></td></tr>
						<tr><td>PG {(prev.pg_rate * 100).toFixed(1)}%</td><td class="num">−{money(prev.pg_fee)}</td></tr>
						<tr><td>인플루언서 {(prev.seller_rate * 100).toFixed(0)}%</td><td class="num">−{money(prev.seller_fee)}</td></tr>
						<tr><td>플랫폼 {(prev.platform_rate * 100).toFixed(0)}%</td><td class="num">−{money(prev.platform_fee_gross)}</td></tr>
						<tr class="tot"><td>브랜드 정산액</td><td class="num">{money(prev.brand_payout)}</td></tr>
						<tr><td>인플루언서 실수령</td><td class="num">{money(prev.seller_payout)}</td></tr>
					</tbody>
				</table>
				<p class="hint" style="margin-top:10px">
					{#if prev.due_on}지급 기준일 <b>{prev.due_on}</b>{/if}
					{#if prev.eligible} · 정산 실행 가능{/if}
					· <a href={data.paths.settle}>정산 화면 →</a>
				</p>
			{/if}
		</div>

		{#if p?.code}
			<div class="card static">
				<h4>상품</h4>
				<p class="hint">검수·노출·판매 실적은 상품 상세에서 봅니다.</p>
				<a href="{data.paths.products}/{encodeURIComponent(p.code)}" class="btn ghost sm">상품 상세 →</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.camp-back {
		margin: 0 3px 12px;
	}
	.camp-title-link {
		text-decoration: none;
		color: inherit;
	}
	.camp-title-link:hover {
		text-decoration: underline;
	}
	.camp-strike {
		opacity: 0.55;
		margin: 0 2px;
	}
	.chip a {
		color: inherit;
		text-decoration: none;
	}
	.chip a:hover {
		text-decoration: underline;
	}
	.camp-reason {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
		margin: 0;
	}
	.camp-reason input {
		flex: 1 1 140px;
		min-width: 0;
	}
	.camp-ship {
		display: grid;
		gap: 6px;
	}
	.camp-stmt {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	.camp-stmt td {
		padding: 5px 0;
	}
	.camp-stmt tr + tr td {
		border-top: 1px solid var(--color-soft-line);
	}
	.camp-stmt .tot td {
		font-weight: 700;
	}
	.console-actions form {
		margin: 0;
	}
</style>
