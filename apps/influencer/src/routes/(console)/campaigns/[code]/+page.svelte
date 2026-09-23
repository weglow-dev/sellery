<script lang="ts">
	/**
	 * 캠페인 상세 — 프로토타입 vCampDetail(js/70-campaign.js) · `packages/ui/src/views/CampaignDetail.svelte` 의 인플루언서 분기 + ScheduleModal 을 props/폼으로 이식.
	 *   머리: 상품 아이콘 · 상품명 · 코드 · 브랜드 × 나 · 판매가 · 수수료 · 기간 · 스테퍼 · 상태 칩
	 *   본문: 스레드(campaign_events — system 은 .sysline, `leak_warned` 는 경고 행, chat 은 .msg.{sender}, leak_flag 면 .leak 강조) + 답글 폼(ThreadComposer · 종료 상태는 안내) · 우측 액션 패널(detActions seller 분기) + 요약
	 *   액션: SAMPLE_SHIPPED → [수령 확인] · TESTING → 일정 제안 폼(시작일 · 기간 3/5/7 칩 · 배정 재고 ≤ 잔여 · 이미 잡힌 기간 · 우선권 안내) + [이번엔 패스](confirm)
	 *         · SCHEDULE_PROPOSED → 제안 내용 + 브랜드 확인 중 + [다시 제안](같은 폼 · proposed_* 프리필) · SCHEDULE_CONFIRMED → 확정 기간 · 잠긴 가격/요율 · 판매 링크 미리보기
	 *         · INVITED → 제안 메시지 + [수락](저장 배송지가 있으면 바로, 없으면 ShippingFields) [거절](사유) · LIVE → 판매 링크 · 나머지는 안내 문구(원문).
	 *   실패한 제출은 `form`(fail 400 · kind 별)으로 값 유지 · 필드 강조.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, md } from '@sellery/db/dates';
	import { LEAK_WARNING, isOfficialSender, senderLabel } from '@sellery/db/partner/chat-rules';
	import { ENDED_STATUSES, payLine, samplePaidLine } from '@sellery/db/partner/sample-rules';
	import { DECLINE_REASON_MAX, endOfPeriod, PERIOD_LEN_CHOICES } from '@sellery/db/partner/schedule-rules';
	import { CampaignStepper, CopyButton, PlatformHandle, ProductIcon, ShippingFields, StatusChip, ThreadComposer } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.campaign);
	const p = $derived(c.product);
	const sh = $derived(data.sample_shipping);
	const ctx = $derived(data.schedule);
	const pct = (r: number) => (r * 100).toFixed(0);
	const dday = (iso: string) => daysBetween(data.today, iso);
	const who = (sender: string) => senderLabel(sender, { seller: data.seller.name, brand: c.brand.name });
	const ended = $derived((ENDED_STATUSES as readonly string[]).includes(c.status));
	/** "샘플 결제 ₩75,650 (🥬 3 + ₩15,650)" — 구매 캠페인만 (4단계 · sample-rules samplePaidLine) */
	const paidLine = $derived(samplePaidLine(c));
	const f = (kind: string) => (form?.kind === kind ? form : null);
	const inv = (kind: string, field: string) => (f(kind)?.field === field ? 'invalid' : '');

	/* ---- 일정 제안 폼 (ScheduleModal): 프리필 = 실패 제출값 > proposed_* > 기본(오늘 + 7 · 5일 · min(500, 잔여)) — 입력값은 폼이 소유하고 종료일만 계산해 보여준다 ---- */
	const pf = $derived(f('propose'));
	const lenChoices = $derived(ctx?.len_choices?.length ? ctx.len_choices : [...PERIOD_LEN_CHOICES]);
	const proposedLen = $derived(ctx?.proposed ? daysBetween(ctx.proposed.start, ctx.proposed.end) + 1 : NaN);
	const initStart = $derived(pf?.values.start || ctx?.proposed?.start || endOfPeriod(data.today, 8));
	const initLen = $derived(Number(pf?.values.len) || (Number.isFinite(proposedLen) && lenChoices.includes(proposedLen) ? proposedLen : 5));
	const initQty = $derived(pf?.values.qty ?? String(ctx?.proposed?.qty ?? Math.min(500, Math.max(ctx?.stock_left ?? 0, 0))));
	// svelte-ignore state_referenced_locally
	let start = $state(initStart);
	// svelte-ignore state_referenced_locally
	let len = $state(initLen);
	const endDate = $derived(start && start.length === 10 ? endOfPeriod(start, len) : '');
	/** 내가 고른 기간과 겹치는 우선권 기간 — 폼 위 안내 (판정은 DB) */
	const clash = $derived(endDate ? data.priorityHolders.filter((h) => !(endDate < h.start || start > h.end)) : []);
	const showForm = $derived(c.status === 'TESTING' || (c.status === 'SCHEDULE_PROPOSED' && !!pf));

	const confirmPass = (e: SubmitEvent) => {
		if (!confirm('이번 상품은 진행하지 않고 패스할까요? 이 캠페인은 종료되고, 이 상품의 무상 샘플 1회는 사용한 것으로 남아요.')) e.preventDefault();
	};
	const af = $derived(f('accept'));
	const needAddress = $derived(!data.savedAddress || !!af);
</script>

<svelte:head>
	<title>{p.name} 캠페인 — 셀러리 파트너</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 목록으로</a>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<section class="card static console-det">
	<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={52} />
	<div class="grow">
		<div class="t">
			{#if data.productHref}<a href={data.productHref} style="text-decoration:none;color:inherit">{p.name}</a>{:else}{p.name}{/if}
			<small>· {c.code.toUpperCase()}</small>
		</div>
		<div class="meta">
			<span class="chip brand">{c.brand.name}</span> × <span class="chip seller"><PlatformHandle platform={data.seller.platform} handle={data.seller.handle} /> {data.seller.name}</span>
			· 판매가 ₩{fmtNum(c.price_locked ?? p.sale_price)} · 수수료 {pct(c.rate_locked ?? p.commission_rate)}%{#if c.start_date}{' '}· 기간 {md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'}{/if}
		</div>
		<CampaignStepper status={c.status} />
	</div>
	<div><StatusChip tone={c.chip.live ? 'live' : c.chip.tone}>{c.chip.label}</StatusChip></div>
</section>

<div class="console-det-body">
	<section class="card static console-thread" aria-label="캠페인 스레드" id="thread">
		<div class="msgs">
			{#each data.events as e (e.id)}
				{#if e.kind === 'system'}
					{#if e.event_type === 'leak_warned'}
						<div class="warnline">⚠ {e.body || LEAK_WARNING}</div>
					{:else}
						<div class="sysline">{e.body} · {md(e.created_at)}</div>
					{/if}
				{:else}
					<div class="msg {e.sender}" class:leak={e.leak_flag}>
						<div class="who">
							{who(e.sender)}
							{#if isOfficialSender(e.sender)}<span class="official" title="셀러리 관리자 공식 발신">✓ 셀러리 인증</span>{/if}
						</div>
						{e.body}
						<div class="tm">{md(e.created_at)}</div>
					</div>
				{/if}
			{:else}
				<div class="sysline">대화가 없습니다</div>
			{/each}
		</div>
		<ThreadComposer action="?/chat" disabled={ended} as="인플루언서" value={f('chat')?.values.body ?? ''} error={f('chat')?.message ?? null} placeholder="브랜드에게 메시지… (일정·수락은 오른쪽 카드의 버튼으로)" />
	</section>

	<div class="console-actions">
		{#if c.status === 'SAMPLE_REQUESTED'}
			<div class="card static"><h4>브랜드 승인 대기 중 ⏳</h4><p class="hint">샘플 요청이 접수됐어요. 브랜드가 프로필을 검토 중입니다 — 보통 24시간 내 응답해요.</p></div>
		{:else if c.status === 'INVITED'}
			<div class="card static">
				<h4>브랜드 직접 제안 <span class="chip seller">인플루언서 액션</span></h4>
				<p class="hint"><b>{c.brand.name}</b>가 <b>{p.name}</b> 판매를 제안했어요 · 수수료 {pct(p.commission_rate)}% · 수락 시 샘플 발송 단계부터 시작됩니다 (무상 · 이달 한도 미차감). 브랜드 메시지는 왼쪽 스레드에서 확인하세요.</p>
				{#if af?.message}<p class="notice danger" role="alert">{af.message}</p>{/if}
				<form method="post" action="?/accept" class="console-form">
					{#if needAddress}
						<p class="hint" style="margin-bottom:8px">샘플을 받을 배송지를 입력해주세요 — 브랜드에 전달되고 내 정보에 저장돼요.</p>
						<ShippingFields value={af ? af.values : data.savedAddress} invalid={af?.field ?? null} idPrefix="inv" />
					{:else if data.savedAddress}
						<p class="hint">
							📦 배송지 <b>{data.savedAddress.recipient} · {data.savedAddress.phone} · ({data.savedAddress.postcode}) {data.savedAddress.address1}{data.savedAddress.address2 ? ` ${data.savedAddress.address2}` : ''}</b>
							<span style="color:var(--color-mute)"> (내 정보의 저장 배송지)</span>
						</p>
					{/if}
					<div class="btnrow">
						<button type="submit" class="pri">수락 → 샘플 받기</button>
						<details class="console-reject">
							<summary class="btn">거절</summary>
							<!-- 거절은 별도 폼 — 수락 폼 안의 details 는 제출을 섞지 않도록 form 속성으로 분리 -->
							<div class="console-form console-reject-form">
								<textarea name="reason" form="decline-form" rows="2" maxlength={DECLINE_REASON_MAX} placeholder="거절 사유 (선택 · 브랜드에게 전달돼요 · {DECLINE_REASON_MAX}자 이내)"></textarea>
								<button type="submit" form="decline-form" class="danger sm">거절 확정</button>
							</div>
						</details>
					</div>
				</form>
				<form method="post" action="?/decline" id="decline-form"></form>
			</div>
		{:else if c.status === 'DECLINED'}
			<div class="card static"><h4>제안 거절됨</h4><p class="hint">이번 제안을 수락하지 않았습니다.{c.decision_reason ? ` 사유: ${c.decision_reason}` : ''}</p></div>
		{:else if c.status === 'SAMPLE_PURCHASED'}
			<div class="card static">
				<h4>결제 완료 · 샘플 발송 준비 중 ⏳</h4>
				<p class="hint">{paidLine || '샘플 구매'} — 브랜드가 발송하면 운송장이 표시됩니다. 발송 전에는 고객센터로 취소를 요청할 수 있어요.</p>
			</div>
		{:else if c.status === 'SAMPLE_APPROVED'}
			<div class="card static"><h4>샘플 발송 준비 중 ⏳</h4><p class="hint">브랜드가 {c.invited ? '제안 수락을 확인했어요' : '요청을 승인했어요'}. 샘플이 발송되면 운송장이 여기 표시됩니다.</p></div>
		{:else if c.status === 'SAMPLE_SHIPPED'}
			<div class="card static">
				<h4>샘플 수령 확인 <span class="chip seller">인플루언서 액션</span></h4>
				<p class="hint">운송장 <b>{c.sample_courier ?? ''} {c.tracking_no || '—'}</b> · 수령 확인 시 테스트 기한 {data.testDays}일이 시작됩니다.</p>
				<form method="post" action="?/receive" class="btnrow">
					<button type="submit" class="pri">수령 확인</button>
				</form>
			</div>
		{:else if c.status === 'TESTING' || c.status === 'SCHEDULE_PROPOSED'}
			<div class="card static">
				{#if c.status === 'TESTING'}
					<h4>테스트 후 진행 결정 <span class="chip seller">인플루언서 액션</span></h4>
					<p class="hint">
						기한 <b>{c.test_due ? md(c.test_due) : '—'}</b>{#if c.test_due}
							{@const left = dday(c.test_due)}
							{#if !Number.isNaN(left)}{' '}({left < 0 ? '기한 지남' : left === 0 ? '오늘 마감' : `D-${left}`}){/if}{/if}
						까지. 진행하려면 판매 일정(시작일 · 기간 · 배정 재고)을 제안하세요 — 브랜드가 승인하면 판매 링크가 열려요.
						{#if c.decision_reason}<br /><span class="console-danger">브랜드 반려 사유: {c.decision_reason}</span> — 다른 기간·수량으로 다시 제안할 수 있어요.{/if}
					</p>
				{:else}
					<h4>브랜드 일정 승인 대기 ⏳</h4>
					<p class="hint">브랜드가 제안한 일정을 검토 중이에요 — 승인되면 판매가 확정되고 판매가·수수료율이 그 시점 값으로 잠깁니다.</p>
					<div class="console-proposal">
						<div><div class="l">시작</div><div class="v">{c.proposed_start ? md(c.proposed_start) : '—'}</div></div>
						<div><div class="l">종료</div><div class="v">{c.proposed_end ? md(c.proposed_end) : '—'}</div></div>
						<div><div class="l">기간</div><div class="v">{Number.isFinite(proposedLen) ? `${proposedLen}일` : '—'}</div></div>
						<div><div class="l">배정 재고</div><div class="v">{fmtNum(c.proposed_qty ?? 0)}<small> 개</small></div></div>
					</div>
				{/if}

				{#if ctx}
					<details class="console-sched-wrap" open={showForm}>
						<summary class="btn {c.status === 'TESTING' ? 'pri' : ''}">{c.status === 'TESTING' ? '진행할게요 → 일정 제안' : '다른 기간으로 다시 제안'}</summary>
						<form method="post" action="?/propose" class="console-form console-sched" style="margin-top:12px">
							{#if pf?.message}<p class="notice danger" role="alert">{pf.message}</p>{/if}
							<div class="fld">
								<label for="sc-slots">이 상품의 확정 · 진행 중 기간 <span class="font-normal">— 플래티넘 이상이 잡은 기간은 플래티넘 이상만 함께 진입할 수 있어요{ctx.is_priority ? ' (내 등급은 우선권이 있어요)' : ''}</span></label>
								<div class="console-slots" id="sc-slots">
									{#each ctx.holders as h (h.campaign_id)}
										<div class="slot" class:prio={h.is_priority && !ctx.is_priority}>
											<span class="rng">{md(h.start)} – {md(h.end)}</span>
											<span>{h.handle} {h.name} <span class="g">{h.grade ?? ''}{h.is_priority ? ' · 우선권' : ''} · 배정 {fmtNum(h.qty)}</span></span>
										</div>
									{:else}
										<div class="slot">아직 확정된 기간 없음 — 원하는 날짜를 고르세요</div>
									{/each}
								</div>
							</div>
							<div class="fld {inv('propose', 'start')}">
								<label for="sc-start">시작일</label>
								<input id="sc-start" name="start" type="date" bind:value={start} min={data.today} required />
							</div>
							<div class="fld {inv('propose', 'len')}">
								<label for="sc-len-{lenChoices[0]}">기간</label>
								<div class="console-lenchips" role="radiogroup" aria-label="판매 기간">
									{#each lenChoices as n (n)}
										<label><input id="sc-len-{n}" type="radio" name="len" value={n} bind:group={len} />{n}일</label>
									{/each}
								</div>
								<div class="endline">종료일 <b>{endDate ? md(endDate) : '—'}</b>{#if endDate}{' '}(시작일 포함 {len}일){/if}</div>
								{#if clash.length}
									<div class="console-err" role="alert">이 기간은 {clash.map((h) => `${h.name}(${h.grade ?? ''})`).join(', ')}님이 잡은 우선 기간과 겹쳐요 — 플래티넘 이상만 함께 판매할 수 있어 다른 날짜가 필요해요.</div>
								{/if}
							</div>
							<div class="fld {inv('propose', 'qty')}">
								<label for="sc-qty">희망 배정 재고 <span class="font-normal">— 배정 가능 {fmtNum(ctx.stock_left)}개 (재고 {fmtNum(ctx.stock)} − 다른 캠페인 배정 {fmtNum(ctx.allocated)})</span></label>
								<input id="sc-qty" name="qty" type="number" value={initQty} min="1" step="1" max={Math.max(ctx.stock_left, 1)} inputmode="numeric" required />
							</div>
							<div class="btnrow">
								<button type="submit" class="pri">{c.status === 'TESTING' ? '승인 요청 보내기' : '다시 제안하기'}</button>
							</div>
						</form>
					</details>
				{/if}
				{#if c.status === 'TESTING'}
					<form method="post" action="?/pass" class="btnrow" style="margin-top:10px" onsubmit={confirmPass}>
						<button type="submit" class="ghost sm">이번엔 패스</button>
						<span class="hint" style="margin:0;align-self:center">패스하면 캠페인이 종료돼요 (페널티 없음 · 이 상품의 무상 샘플 1회는 소진)</span>
					</form>
				{/if}
			</div>
		{:else if c.status === 'SCHEDULE_CONFIRMED'}
			<div class="card static">
				<h4>판매 대기 중 · 일정 확정 ✓</h4>
				<div class="console-proposal">
					<div><div class="l">기간</div><div class="v">{c.start_date ? md(c.start_date) : '—'} – {c.end_date ? md(c.end_date) : '—'}</div></div>
					<div><div class="l">배정 재고</div><div class="v">{fmtNum(c.qty)}<small>개</small></div></div>
					<div><div class="l">잠긴 판매가</div><div class="v">₩{fmtNum(c.price_locked ?? p.sale_price)}</div></div>
					<div><div class="l">잠긴 수수료</div><div class="v">{pct(c.rate_locked ?? p.commission_rate)}%</div></div>
				</div>
				<p class="hint">시작 <b>{c.start_date ? md(c.start_date) : '—'}</b>{#if c.start_date}{' '}(D-{Math.max(dday(c.start_date), 0)}){/if} — 판매가와 수수료율은 확정 시점 값으로 잠겼어요. 브랜드가 상품 가격을 바꿔도 이 캠페인엔 적용되지 않습니다. 시작일이 되면 아래 링크가 자동으로 열려요.</p>
				<p class="hint"><code>{data.storeDisplay}</code></p>
				<div class="btnrow">
					<CopyButton text={data.storeUrl} label="링크 복사 (시작일에 열림)" />
				</div>
			</div>
		{:else if c.status === 'LIVE'}
			<div class="card static">
				<h4>판매 링크 <StatusChip tone="live">판매 진행중</StatusChip></h4>
				<p class="hint"><code>{data.storeDisplay}</code> · 종료 {c.end_date ? md(c.end_date) : '—'} · 판매 {fmtNum(c.sold_qty)}/{fmtNum(c.qty)}개</p>
				<div class="btnrow">
					<a href={data.storeUrl} class="btn pri" target="_blank" rel="noopener">판매 페이지 보기</a>
					<CopyButton text={data.storeUrl} label="링크 복사" />
				</div>
			</div>
		{:else if c.status === 'CLEARING'}
			<div class="card static">
				<h4>교환·환불 처리 기간</h4>
				<p class="hint">종료 {c.end_date ? md(c.end_date) : '—'} → 정산 기준일 <b>{data.settleDue ? md(data.settleDue) : '—'}</b> (D+{data.clearDays}). 이 기간의 환불은 정산액에서 차감됩니다.</p>
			</div>
		{:else if c.status === 'SETTLED'}
			<div class="card static">
				<h4>정산 완료 ✓</h4>
				<p class="hint">정산 명세와 지급 내역은 매출·정산 화면에서 확인하세요. 성과가 좋았다면 같은 조합으로 바로 재판매를 열 수 있습니다(다음 단계).</p>
			</div>
		{:else if c.status === 'REJECTED'}
			<div class="card static"><h4>거절된 요청</h4><p class="hint">브랜드가 이번 요청을 승인하지 않았습니다.{c.decision_reason ? ` 사유: ${c.decision_reason}` : ''}</p></div>
		{:else if c.status === 'PASSED'}
			<div class="card static"><h4>패스한 캠페인</h4><p class="hint">테스트 후 진행하지 않기로 했어요. 같은 상품을 다시 요청할 수 있습니다.</p></div>
		{:else}
			<div class="card static"><h4>{c.chip.label}</h4></div>
		{/if}

		<div class="card static">
			<h4>요약</h4>
			<dl class="console-kv">
				<dt>상태</dt>
				<dd>{c.chip.label}{c.chip.turn ? ` · ${c.chip.turn === 'seller' ? '내 차례' : '브랜드 차례'}` : ''}</dd>
				<dt>요청일</dt>
				<dd>{md(c.created_at)}{c.invited ? ' · 브랜드 제안' : c.purchased ? ' · 샘플 구매' : ' · 무상 샘플'}</dd>
				{#if paidLine}<dt>샘플 결제</dt><dd>{payLine({ amount_total: c.sample_price ?? 0, amount_cel: c.sample_cel, amount_cash: c.sample_cash })}</dd>{/if}
				{#if c.tracking_no}<dt>운송장</dt><dd>{c.sample_courier ?? ''} {c.tracking_no}</dd>{/if}
				{#if c.received_at}<dt>수령 확인</dt><dd>{md(c.received_at)}</dd>{/if}
				{#if c.test_due}<dt>테스트 기한</dt><dd>{md(c.test_due)}</dd>{/if}
				{#if c.proposed_start && !c.start_date}<dt>제안 기간</dt><dd>{md(c.proposed_start)}–{c.proposed_end ? md(c.proposed_end) : '—'} · 재고 {fmtNum(c.proposed_qty ?? 0)}개</dd>{/if}
				{#if c.start_date}<dt>판매 기간</dt><dd>{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'} · 재고 {fmtNum(c.qty)}개</dd>{/if}
				{#if c.price_locked !== null}<dt>잠긴 가격</dt><dd>₩{fmtNum(c.price_locked)} · 수수료 {pct(c.rate_locked ?? p.commission_rate)}%</dd>{/if}
				{#if data.settleDue}<dt>정산 기준일</dt><dd>{md(data.settleDue)} (D+{data.clearDays})</dd>{/if}
				{#if c.decision_reason && (c.status === 'REJECTED' || c.status === 'DECLINED' || c.status === 'TESTING')}<dt>{c.status === 'TESTING' ? '반려 사유' : '사유'}</dt><dd>{c.decision_reason}</dd>{/if}
				<dt>샘플 배송지</dt>
				<dd>
					{#if sh}
						{sh.recipient} · {sh.phone}<br />({sh.postcode}) {sh.address1}{sh.address2 ? ` ${sh.address2}` : ''}{#if sh.memo}<br /><span style="color:var(--color-mute)">메모: {sh.memo}</span>{/if}
					{:else}{' '}—
					{/if}
				</dd>
			</dl>
		</div>
	</div>
</div>
