<script lang="ts">
	/**
	 * 캠페인 상세 — 프로토타입 vCampDetail(js/70-campaign.js) · `packages/ui/src/views/CampaignDetail.svelte` 브랜드 분기(detActions V==='brand') 를 props 로 이식. 인플루언서 `/campaigns/[code]` 와 같은 골격.
	 *   머리: 상품 아이콘 · 상품명 · 코드 · 브랜드 × 인플루언서 · 판매가 · 수수료 · 기간 · 스테퍼 · 상태 칩
	 *   본문: 스레드(campaign_events — system 은 .sysline, `leak_warned` 는 경고 행, chat 은 .msg.{sender}, leak_flag 면 .leak 강조) + 답글 폼(ThreadComposer · 종료 상태는 안내) · 우측 브랜드 액션 패널 + 인플루언서 카드 + 요약
	 *   액션: SAMPLE_REQUESTED → [승인] [거절](?/approve ?/reject) · SAMPLE_APPROVED/SAMPLE_PURCHASED → 택배사 + 송장 [발송 처리](?/ship) · TESTING → 테스트 중 D-n
	 *         · SCHEDULE_PROPOSED → 제안 카드(기간 · 배정 · 잔여 재고 · 우선권 안내) + [일정 확정](?/confirm) [반려](?/rejectSchedule · 사유) · SCHEDULE_CONFIRMED → 확정 기간 + 잠긴 가격/요율
	 *         · INVITED → 초대 수락 대기 · LIVE → 판매 링크 + 주문 탭 링크(4단계) · 나머지는 안내 문구(원문).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, md } from '@sellery/db/dates';
	import { COURIERS, ENDED_STATUSES, periodLine, REJECT_REASON_MAX } from '@sellery/db/brand/campaign-rules';
	import { LEAK_WARNING, senderLabel } from '@sellery/db/partner/chat-rules';
	import { CampaignStepper, CopyButton, GradeBox, PlatformHandle, ProductIcon, SellerAvatar, StatusChip, ThreadComposer } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.campaign);
	const p = $derived(c.product);
	const s = $derived(c.seller);
	const sh = $derived(data.sample_shipping);
	const pct = (r: number) => (r * 100).toFixed(0);
	const dday = (iso: string) => daysBetween(data.today, iso);
	const who = (sender: string) => senderLabel(sender, { seller: s.name, brand: data.brand.name });
	const ended = $derived((ENDED_STATUSES as readonly string[]).includes(c.status));
	const f = (kind: string) => (form?.kind === kind ? form : null);
	const inv = (k: string) => (form?.kind === 'ship' && form.field === k ? 'invalid' : '');
	const proposedLen = $derived(c.proposed_start && c.proposed_end ? daysBetween(c.proposed_start, c.proposed_end) + 1 : NaN);
	const stockShort = $derived((c.proposed_qty ?? 0) > c.stock_left);
	const confirmSchedule = (e: SubmitEvent) => {
		if (!confirm(`${periodLine(c.proposed_start, c.proposed_end, c.proposed_qty)} 으로 판매를 확정할까요? 확정하면 판매가 ₩${fmtNum(p.sale_price)} · 수수료 ${pct(p.commission_rate)}% 가 잠기고 시작일에 판매 링크가 열려요.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>{p.name} 캠페인 — 셀러리 파트너</title>
</svelte:head>

<a href={c.chip.turn === 'brand' ? data.requestsPath : data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← {c.chip.turn === 'brand' ? '처리 대기' : '내 캠페인'}</a>

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
			<span class="chip brand">{data.brand.name}</span> × <span class="chip seller"><PlatformHandle platform={s.platform} handle={s.handle} /> {s.name}</span>
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
						<div class="who">{who(e.sender)}</div>
						{e.body}
						<div class="tm">{md(e.created_at)}</div>
					</div>
				{/if}
			{:else}
				<div class="sysline">대화가 없습니다</div>
			{/each}
		</div>
		<ThreadComposer action="?/chat" disabled={ended} as="브랜드" value={f('chat')?.values.body ?? ''} error={f('chat')?.message ?? null} placeholder="인플루언서에게 메시지… (승인·일정은 오른쪽 카드의 버튼으로)" />
	</section>

	<div class="console-actions">
		{#if c.status === 'SAMPLE_REQUESTED'}
			<div class="card static">
				<h4>샘플 요청 검토 <span class="chip brand">브랜드 액션</span></h4>
				<p class="hint"><PlatformHandle platform={s.platform} handle={s.handle} /> {s.name} · 팔로워 {fmtNum(s.followers)} · 등급 {s.grade ?? '스타터'}. 승인 시 배송지가 브랜드에 전달됩니다.</p>
				<div class="btnrow">
					<form method="post" action="?/approve"><button type="submit" class="pri">승인</button></form>
					<details class="console-reject">
						<summary class="btn danger">거절</summary>
						<form method="post" action="?/reject" class="console-form console-reject-form">
							<textarea name="reason" rows="2" maxlength={REJECT_REASON_MAX} placeholder="거절 사유 (선택 · 인플루언서에게 전달돼요 · {REJECT_REASON_MAX}자 이내)">{f('reject')?.values?.reason ?? ''}</textarea>
							<button type="submit" class="danger sm">거절 확정</button>
						</form>
					</details>
				</div>
			</div>
		{:else if c.status === 'INVITED'}
			<div class="card static">
				<h4>초대 수락 대기 중 ⏳</h4>
				<p class="hint">제안을 보냈어요. 인플루언서가 수락하면 배송지가 전달되고 샘플 발송 대기로 넘어갑니다 — 보통 48시간 내 응답해요. 궁금한 점은 왼쪽 스레드로 물어보세요.</p>
			</div>
		{:else if c.status === 'DECLINED'}
			<div class="card static"><h4>제안 거절됨</h4><p class="hint">인플루언서가 이번 제안을 수락하지 않았습니다.{c.decision_reason ? ` 사유: ${c.decision_reason}` : ''}</p></div>
		{:else if c.status === 'SAMPLE_PURCHASED' || c.status === 'SAMPLE_APPROVED'}
			<div class="card static">
				<h4>
					샘플 발송 <span class="chip brand">브랜드 액션</span>
					{#if c.status === 'SAMPLE_PURCHASED'}<span class="st green" style="animation:none">구매 완료 ₩{fmtNum(c.sample_price ?? 0)}</span>{/if}
				</h4>
				<p class="hint">
					{c.status === 'SAMPLE_PURCHASED' ? '인플루언서가 샘플을 구매했습니다(승인 불필요). ' : c.invited ? '인플루언서가 제안을 수락했어요. ' : ''}택배사와 송장번호를 입력하면 배송 추적이 시작됩니다 — 인플루언서가 수령 확인을 하면 테스트({data.testDays}일)가 시작돼요.
				</p>
				{#if data.shippingText}
					<p class="hint">📦 배송지 <b>{data.shippingText}</b></p>
				{:else}
					<p class="hint console-danger">배송지가 아직 없어요 — 인플루언서가 배송지를 등록하면 여기 표시됩니다.</p>
				{/if}
				<form method="post" action="?/ship" class="console-form">
					<div class="fld {inv('courier')}">
						<label for="cd-courier">택배사</label>
						<select id="cd-courier" name="courier" required>
							<option value="" selected={!f('ship')?.values?.courier} disabled>택배사 선택</option>
							{#each COURIERS as k (k)}<option value={k} selected={f('ship')?.values?.courier === k}>{k}</option>{/each}
						</select>
					</div>
					<div class="fld {inv('tracking_no')}">
						<label for="cd-track">송장번호</label>
						<input id="cd-track" name="tracking_no" value={f('ship')?.values?.tracking_no ?? ''} placeholder="예: 6890-1234-5678" inputmode="numeric" required />
						{#if f('ship')?.field}<div class="console-err" role="alert">{f('ship')?.message}</div>{/if}
					</div>
					<div class="btnrow"><button type="submit" class="pri">발송 처리</button></div>
				</form>
			</div>
		{:else if c.status === 'SAMPLE_SHIPPED'}
			<div class="card static">
				<h4>인플루언서 수령 대기 중 ⏳</h4>
				<p class="hint">운송장 <b>{c.sample_courier ?? ''} {c.tracking_no || '—'}</b>{#if data.trackingUrl}{' '}<a href={data.trackingUrl} target="_blank" rel="noopener">배송 조회 ↗</a>{/if} · 인플루언서가 수령을 확인하면 테스트가 시작됩니다.</p>
			</div>
		{:else if c.status === 'TESTING'}
			<div class="card static">
				<h4>인플루언서 테스트 중 🧪</h4>
				<p class="hint">
					인플루언서가 샘플을 사용해보고 있어요. 기한 <b>{c.test_due ? md(c.test_due) : '—'}</b>{#if c.test_due}
						{@const left = dday(c.test_due)}
						{#if !Number.isNaN(left)}{' '}({left < 0 ? '기한 지남' : left === 0 ? '오늘 마감' : `D-${left}`}){/if}{/if}
					까지 판매 일정을 제안하거나 패스합니다.
					{#if c.decision_reason}<br /><span class="console-danger">반려 사유: {c.decision_reason}</span> — 인플루언서의 재제안을 기다리고 있어요.{/if}
				</p>
			</div>
		{:else if c.status === 'SCHEDULE_PROPOSED'}
			<div class="card static">
				<h4>일정 확정 · 반려 <span class="chip brand">브랜드 액션</span></h4>
				<p class="hint">인플루언서가 제안한 판매 기간과 배정 재고예요. 확정하면 이 기간이 캘린더에 잠기고 <b>판매가 ₩{fmtNum(p.sale_price)} · 수수료 {pct(p.commission_rate)}%</b>가 이 시점 값으로 잠깁니다.</p>
				<div class="console-proposal">
					<div><div class="l">시작</div><div class="v">{c.proposed_start ? md(c.proposed_start) : '—'}{#if c.proposed_start}<small> D-{Math.max(dday(c.proposed_start), 0)}</small>{/if}</div></div>
					<div><div class="l">종료</div><div class="v">{c.proposed_end ? md(c.proposed_end) : '—'}{#if Number.isFinite(proposedLen)}<small> · {proposedLen}일</small>{/if}</div></div>
					<div><div class="l">배정 재고</div><div class="v" class:danger={stockShort}>{fmtNum(c.proposed_qty ?? 0)}<small> 개</small></div></div>
					<div><div class="l">잔여 재고</div><div class="v">{fmtNum(c.stock_left)}<small> / {fmtNum(c.stock)}</small></div></div>
				</div>
				{#if stockShort}
					<p class="hint console-danger">잔여 재고({fmtNum(c.stock_left)}개)보다 많은 수량이에요 — 상품 재고를 늘리거나 반려하고 수량 조정을 요청하세요.</p>
				{/if}
				{#if c.proposed_start && dday(c.proposed_start) < 0}
					<p class="hint console-danger">제안된 시작일이 이미 지났어요 — 반려하고 다시 제안을 요청하세요.</p>
				{/if}
				<p class="hint">
					{#if s.is_priority}
						<b>{s.grade}</b> 등급 인플루언서예요 — 우선권 등급이라 이 기간에는 플래티넘 이상만 함께 진입할 수 있어요.
					{:else}
						{s.grade ?? '스타터'} 등급 · 같은 기간에 플래티넘 이상이 확정한 캠페인이 있으면 확정 시 차단돼요(반려 후 재제안).
					{/if}
				</p>
				<div class="btnrow">
					<form method="post" action="?/confirm" onsubmit={confirmSchedule}><button type="submit" class="pri">일정 확정</button></form>
					<details class="console-reject">
						<summary class="btn danger">반려 (재제안 요청)</summary>
						<form method="post" action="?/rejectSchedule" class="console-form console-reject-form">
							<textarea name="reason" rows="2" maxlength={REJECT_REASON_MAX} placeholder="반려 사유 (선택 · 인플루언서에게 전달돼요 · 예: 추석 연휴와 겹쳐요 · {REJECT_REASON_MAX}자 이내)"></textarea>
							<button type="submit" class="danger sm">반려 확정</button>
						</form>
					</details>
				</div>
			</div>
		{:else if c.status === 'SCHEDULE_CONFIRMED'}
			<div class="card static">
				<h4>판매 대기 중 · 일정 확정 ✓</h4>
				<div class="console-proposal">
					<div><div class="l">기간</div><div class="v">{periodLine(c.start_date, c.end_date)}</div></div>
					<div><div class="l">배정 재고</div><div class="v">{fmtNum(c.qty)}<small> 개</small></div></div>
					<div><div class="l">잠긴 판매가</div><div class="v">₩{fmtNum(c.price_locked ?? p.sale_price)}</div></div>
					<div><div class="l">잠긴 수수료</div><div class="v">{pct(c.rate_locked ?? p.commission_rate)}%</div></div>
				</div>
				<p class="hint">시작 <b>{c.start_date ? md(c.start_date) : '—'}</b>{#if c.start_date}{' '}(D-{Math.max(dday(c.start_date), 0)}){/if} — 시작 시각에 링크가 자동 활성화됩니다. 판매가 · 수수료율은 확정 시점 값으로 잠겨 상품을 수정해도 이 캠페인엔 적용되지 않아요.</p>
				<p class="hint"><code>{data.storeDisplay}</code></p>
			</div>
		{:else if c.status === 'LIVE'}
			<div class="card static">
				<h4>판매 링크 <StatusChip tone="live">판매 진행중</StatusChip></h4>
				<p class="hint"><code>{data.storeDisplay}</code> · 종료 {c.end_date ? md(c.end_date) : '—'} · 판매 {fmtNum(c.sold_qty)}/{fmtNum(c.qty)}개</p>
				<div class="btnrow">
					<a href={data.storeUrl} class="btn pri" target="_blank" rel="noopener">판매 페이지 미리보기</a>
					<CopyButton text={data.storeUrl} label="링크 복사" />
				</div>
				<p class="hint" style="margin:8px 0 0">주문 · 발주서 · 운송장은 <a href={data.ordersHref}>주문 탭</a>에서 — 이 캠페인만 필터돼요.</p>
			</div>
		{:else if c.status === 'CLEARING'}
			<div class="card static">
				<h4>교환·환불 처리 기간</h4>
				<p class="hint">종료 {c.end_date ? md(c.end_date) : '—'} → 정산 기준일 <b>{data.settleDue ? md(data.settleDue) : '—'}</b> (D+{data.clearDays}). 이 기간의 환불은 정산액에서 차감됩니다.</p>
			</div>
		{:else if c.status === 'SETTLED'}
			<div class="card static">
				<h4>정산 완료 ✓</h4>
				<p class="hint">정산 명세와 브랜드 지급액은 <b>5단계</b> 정산 화면에서 열립니다. 성과가 좋았다면 같은 조합으로 바로 재판매를 열 수 있습니다.</p>
			</div>
		{:else if c.status === 'REJECTED'}
			<div class="card static"><h4>거절된 요청</h4><p class="hint">이번 요청을 승인하지 않았습니다.{c.decision_reason ? ` 사유: ${c.decision_reason}` : ''}</p></div>
		{:else if c.status === 'PASSED'}
			<div class="card static">
				<h4>인플루언서 패스</h4>
				<p class="hint">인플루언서가 테스트 후 진행하지 않기로 했습니다.{#if data.inviteHref}{' '}다른 인플루언서에게 <a href={data.inviteHref}>직접 제안</a>해볼 수 있어요.{/if}</p>
			</div>
		{:else}
			<div class="card static"><h4>{c.chip.label}</h4></div>
		{/if}

		<div class="card static">
			<h4>인플루언서</h4>
			<div class="console-seller">
				<SellerAvatar avatarUrl={s.avatar_url} size={40} />
				<div class="grow">
					<div class="nm"><GradeBox grade={s.grade} sm /> {s.name} <span class="sub"><PlatformHandle platform={s.platform} handle={s.handle} /></span></div>
					<div class="sub">
						팔로워 {fmtNum(s.followers)}{#if s.is_priority}{' '}· 기간 우선권{/if}{#if s.primary_channel?.verified}{' '}· ✓ 인증 채널{/if}{#if s.primary_channel?.url}{' '}· <a href={s.primary_channel.url} target="_blank" rel="noopener">채널 보기 ↗</a>{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="card static">
			<h4>요약</h4>
			<dl class="console-kv">
				<dt>상태</dt>
				<dd>{c.chip.label}{c.chip.turn ? ` · ${c.chip.turn === 'brand' ? '내 차례' : '인플루언서 차례'}` : ''}</dd>
				<dt>요청일</dt>
				<dd>{md(c.created_at)}{c.invited ? ' · 브랜드 제안' : c.purchased ? ' · 샘플 구매' : ' · 무상 샘플'}</dd>
				{#if data.paidLine}<dt>샘플 결제</dt><dd>{data.paidLine.replace(/^샘플 결제 /, '')}</dd>{/if}
				<dt>샘플 배송지</dt>
				<dd>
					{#if sh}
						{sh.recipient} · {sh.phone}<br />({sh.postcode}) {sh.address1}{sh.address2 ? ` ${sh.address2}` : ''}{#if sh.memo}<br /><span style="color:var(--color-mute)">메모: {sh.memo}</span>{/if}
					{:else}{' '}—
					{/if}
				</dd>
				{#if c.tracking_no}
					<dt>운송장</dt>
					<dd>{c.sample_courier ?? ''} {c.tracking_no}{#if data.trackingUrl}{' '}<a href={data.trackingUrl} target="_blank" rel="noopener">조회 ↗</a>{/if}{#if c.sample_shipped_at}<br /><span style="color:var(--color-mute)">발송 {md(c.sample_shipped_at)}</span>{/if}</dd>
				{/if}
				{#if c.received_at}<dt>수령 확인</dt><dd>{md(c.received_at)}</dd>{/if}
				{#if c.test_due}<dt>테스트 기한</dt><dd>{md(c.test_due)}</dd>{/if}
				{#if c.proposed_start && !c.start_date}<dt>제안 기간</dt><dd>{md(c.proposed_start)}–{c.proposed_end ? md(c.proposed_end) : '—'} · 재고 {fmtNum(c.proposed_qty ?? 0)}개</dd>{/if}
				{#if c.start_date}<dt>판매 기간</dt><dd>{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'} · 재고 {fmtNum(c.qty)}개</dd>{/if}
				{#if c.price_locked !== null}<dt>잠긴 가격</dt><dd>₩{fmtNum(c.price_locked)} · 수수료 {pct(c.rate_locked ?? p.commission_rate)}%</dd>{/if}
				<dt>재고</dt>
				<dd>잔여 {fmtNum(c.stock_left)} / {fmtNum(c.stock)}개</dd>
				{#if data.settleDue}<dt>정산 기준일</dt><dd>{md(data.settleDue)} (D+{data.clearDays})</dd>{/if}
				{#if c.decision_reason}<dt>{c.status === 'TESTING' ? '반려 사유' : '사유'}</dt><dd>{c.decision_reason}</dd>{/if}
			</dl>
		</div>
	</div>
</div>
