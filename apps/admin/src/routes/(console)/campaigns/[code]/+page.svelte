<script lang="ts">
	/**
	 * 관리자 캠페인 상세 — 데모 캠페인 상세 화면과 같은 구성:
	 *   1 상단: 상품 · 브랜드 × 인플루언서 · 판매가 · 수수료 · 상태 칩
	 *   2 흐름 스테퍼 9단계
	 *   3 스레드(시스템 이벤트 + 당사자 대화) + 관리자 발신 입력
	 *   4 우측: 브랜드 대행 액션 · 정산 미리보기
	 *
	 * 데모와 다른 점: 발신이 **"셀러리 운영팀"** 으로 남는다(데모는 브랜드로 위장 발신).
	 * 브랜드가 쓰지 않은 말이 브랜드 이름으로 남으면 분쟁이 되고, `campaign_post_chat` 이 sender·actor_role 을
	 * 같은 값으로 넣으므로 위장 자체가 불가능하다. 화면에도 그 사실을 적는다.
	 */
	import { enhance } from '$app/forms';
	import { fmtNum } from '@sellery/db/campaign';
	import { senderLabel } from '@sellery/db/partner/chat-rules';
	import { adminCampaignAction, campaignFlowSteps, campaignPeriodLabel, campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { COURIERS } from '@sellery/db/brand/campaign-rules';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const c = $derived(data.campaign);
	const chip = $derived(campaignStatusChip(c.status));
	const steps = $derived(campaignFlowSteps(c.status));
	const action = $derived(adminCampaignAction(c.status));
	const names = $derived({ seller: c.seller?.name ?? null, brand: c.brand?.name ?? null });

	const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₩${fmtNum(n)}`);
	const dt = (iso: string) => {
		const d = new Date(iso);
		const s = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
		const [, m, day] = s.split('-');
		return `${Number(m)}/${Number(day)}`;
	};

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
	<title>{c.product?.name ?? c.code} 캠페인 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<a href={data.paths.home} class="btn ghost sm">← 대시보드</a>
	<h2>{c.product?.name ?? '—'}</h2>
	<span class="console-mono meta">{c.code ?? ''}</span>
	<span class="st {chip.tone}">{chip.label}</span>
</div>

{#if msg}
	<p class="notice" class:danger={msg.tone === 'danger'} role="status">{msg.text}</p>
{/if}

<!-- 1. 개요 -->
<section class="console-card">
	<p class="meta">
		{#if c.brand?.code}<a href="{data.paths.brands}/{encodeURIComponent(c.brand.code)}">{c.brand.name}</a>{:else}{c.brand?.name ?? '—'}{/if}
		×
		{#if c.seller?.code}<a href="{data.paths.sellers}/{encodeURIComponent(c.seller.code)}">{c.seller.name}</a>{:else}{c.seller?.name ?? '—'}{/if}
		{#if c.seller?.handle}<span class="console-mono">{c.seller.handle}</span>{/if}
		· 판매가 {money(c.product?.sale_price)}
		{#if c.commission_rate !== null}· 수수료 {(c.commission_rate * 100).toFixed(0)}%{/if}
		{#if c.auto}· 자동 제안{:else if c.invited}· 브랜드 제안{/if}
	</p>
	<p class="meta">
		기간 {campaignPeriodLabel(c.start_date, c.end_date)}
		{#if c.qty !== null}· 재고 {fmtNum(c.qty)}{/if}
		{#if c.sold_qty}· 판매 {fmtNum(c.sold_qty)}{/if}
		{#if c.product?.code}· <a href="{data.paths.products}/{encodeURIComponent(c.product.code)}">상품 상세</a>{/if}
	</p>

	<!-- 2. 흐름 스테퍼 -->
	<ol class="admin-flow" aria-label="캠페인 진행 단계">
		{#each steps as s (s.status)}
			<li class={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>{s.label}</li>
		{/each}
	</ol>
</section>

<div class="admin-camp-2col">
	<!-- 3. 스레드 -->
	<section class="console-card">
		<h4>스레드 <span class="meta">{c.events.length}건</span></h4>

		{#if c.events.length === 0}
			<p class="meta">아직 기록이 없습니다.</p>
		{:else}
			<ul class="admin-thread">
				{#each c.events as e (e.id)}
					{#if e.kind === 'system'}
						<li class="sys"><span class="b">{e.body}</span> <span class="meta">{dt(e.created_at)}</span></li>
					{:else}
						<li class="chat {e.sender}">
							<span class="who">{senderLabel(e.sender, names)}</span>
							<span class="b">{e.body}</span>
							<span class="meta">
								{dt(e.created_at)}
								{#if e.leak_flag}· 연락처 공유 감지{/if}
								{#if e.actor_role && e.actor_role !== e.sender}· 실제 발신 {e.actor_role}{/if}
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}

		<form method="POST" action="?/postChat" use:enhance class="admin-chat-form">
			<label for="body" class="meta">셀러리 운영팀으로 발신 — 인플루언서·브랜드 모두에게 운영팀으로 표시됩니다</label>
			<div class="row">
				<input id="body" name="body" type="text" maxlength="1000" placeholder="메시지 입력… (승인·일정은 오른쪽 버튼으로)" required />
				<button type="submit" class="pri sm">전송</button>
			</div>
			{#if form?.chatError}<p class="notice danger" role="alert">{form.chatError}</p>{/if}
		</form>
	</section>

	<div class="admin-camp-side">
		<!-- 4. 브랜드 대행 액션 -->
		{#if action.kind !== 'none'}
			<section class="console-card">
				<h4>{action.label} <span class="meta">브랜드 대행</span></h4>
				<p class="meta">{action.hint}</p>

				{#if action.kind === 'approve_sample'}
					{#if c.seller}
						<p class="meta">
							{c.seller.name} {c.seller.handle}
							{#if c.seller.followers}· 팔로워 {fmtNum(c.seller.followers)}{/if}
							{#if c.seller.grade}· 등급 {c.seller.grade}{/if}
						</p>
					{/if}
					<div class="console-actions">
						<form method="POST" action="?/approveSample" use:enhance>
							<button type="submit" class="pri sm">승인</button>
						</form>
						<form method="POST" action="?/rejectSample" use:enhance class="admin-reason">
							<input name="reason" type="text" maxlength="200" placeholder="거절 사유 (선택)" />
							<button type="submit" class="ghost sm">거절</button>
						</form>
					</div>
				{:else if action.kind === 'ship_sample'}
					<form method="POST" action="?/shipSample" use:enhance class="admin-ship">
						<label for="courier" class="meta">택배사</label>
						<select id="courier" name="courier" required>
							{#each COURIERS as k (k)}<option value={k}>{k}</option>{/each}
						</select>
						<label for="tracking_no" class="meta">운송장 번호</label>
						<input id="tracking_no" name="tracking_no" type="text" maxlength="30" required />
						<button type="submit" class="pri sm">발송 등록</button>
					</form>
					{#if form?.shipError}<p class="notice danger" role="alert">{form.shipError}</p>{/if}
				{:else if action.kind === 'confirm_schedule'}
					<p class="meta">제안된 기간 {campaignPeriodLabel(c.start_date, c.end_date)}{#if c.qty !== null} · 재고 {fmtNum(c.qty)}{/if}</p>
					<div class="console-actions">
						<form method="POST" action="?/confirmSchedule" use:enhance>
							<button type="submit" class="pri sm">일정 확정</button>
						</form>
						<form method="POST" action="?/rejectSchedule" use:enhance class="admin-reason">
							<input name="reason" type="text" maxlength="200" placeholder="거절 사유 (선택)" />
							<button type="submit" class="ghost sm">거절</button>
						</form>
					</div>
				{/if}
			</section>
		{/if}

		<!-- 정산 미리보기 -->
		<section class="console-card">
			<h4>정산 미리보기</h4>
			{#if !data.campaign.preview}
				<p class="meta">판매가 시작되면 계산됩니다.</p>
			{:else}
				{@const p = data.campaign.preview}
				<table class="admin-settle-preview">
					<tbody>
						<tr><th>결제 {fmtNum(p.paid_count)}건</th><td class="num">{money(p.gross)}</td></tr>
						<tr><th>환불 {fmtNum(p.refund_count)}건</th><td class="num">−{money(p.refunds)}</td></tr>
						<tr class="sum"><th>확정 매출</th><td class="num">{money(p.net)}</td></tr>
						<tr><th>PG {(p.pg_rate * 100).toFixed(1)}%</th><td class="num">−{money(p.pg_fee)}</td></tr>
						<tr><th>인플루언서 {(p.seller_rate * 100).toFixed(0)}%</th><td class="num">−{money(p.seller_fee)}</td></tr>
						<tr><th>플랫폼 {(p.platform_rate * 100).toFixed(0)}%</th><td class="num">−{money(p.platform_fee_gross)}</td></tr>
						<tr class="sum"><th>브랜드 정산액</th><td class="num">{money(p.brand_payout)}</td></tr>
						<tr><th>인플루언서 실수령</th><td class="num">{money(p.seller_payout)}</td></tr>
					</tbody>
				</table>
				<p class="meta">
					{#if p.due_on}지급 기준일 {p.due_on}{/if}
					{#if p.eligible}· 정산 실행 가능{/if}
					· <a href={data.paths.settle}>정산 화면</a>
				</p>
			{/if}
		</section>
	</div>
</div>

<style>
	/* 흐름 스테퍼 — 데모 FLOW 띠 */
	.admin-flow {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 12px 0 0;
		padding: 0;
	}
	.admin-flow li {
		border: 1.5px solid var(--color-line);
		padding: 3px 8px;
		font-size: 0.78rem;
		opacity: 0.45;
	}
	.admin-flow li.done {
		opacity: 1;
	}
	.admin-flow li.current {
		opacity: 1;
		font-weight: 700;
		border-width: 2px;
	}

	.admin-camp-2col {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
		gap: 10px;
		margin-top: 10px;
	}
	@media (max-width: 860px) {
		.admin-camp-2col {
			grid-template-columns: 1fr;
		}
	}
	.admin-camp-side {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.admin-thread {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.admin-thread .sys {
		text-align: center;
		font-size: 0.82rem;
	}
	.admin-thread .chat {
		border: 1.5px solid var(--color-line);
		padding: 8px 10px;
	}
	/* 운영팀 발신은 눈에 띄게 — 당사자 대화와 섞이면 누가 말했는지 헷갈린다 */
	.admin-thread .chat.admin {
		border-width: 2px;
	}
	.admin-thread .who {
		display: block;
		font-weight: 700;
		font-size: 0.8rem;
	}
	.admin-thread .b {
		display: block;
	}

	.admin-chat-form .row {
		display: flex;
		gap: 6px;
		margin-top: 4px;
	}
	.admin-chat-form input {
		flex: 1;
		min-width: 0;
	}

	.admin-reason {
		display: flex;
		gap: 6px;
	}
	.admin-ship {
		display: grid;
		gap: 4px;
	}

	.admin-settle-preview {
		width: 100%;
		border-collapse: collapse;
	}
	.admin-settle-preview th {
		text-align: left;
		font-weight: 400;
		padding: 5px 0;
	}
	.admin-settle-preview td {
		padding: 5px 0;
	}
	.admin-settle-preview tr + tr th,
	.admin-settle-preview tr + tr td {
		border-top: 1px solid var(--color-line);
	}
	.admin-settle-preview .sum th,
	.admin-settle-preview .sum td {
		font-weight: 700;
	}
</style>
