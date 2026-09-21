<script lang="ts">
	/**
	 * 캠페인 상세 — 프로토타입 vCampDetail(js/70-campaign.js) · `packages/ui/src/views/CampaignDetail.svelte` 브랜드 분기(detActions V==='brand') 를 props 로 이식. 인플루언서 `/campaigns/[code]` 와 같은 골격.
	 *   머리: 상품 아이콘 · 상품명 · 코드 · 브랜드 × 인플루언서 · 판매가 · 수수료 · 기간 · 스테퍼 · 상태 칩
	 *   본문: 스레드(campaign_events — system 은 .sysline, chat 은 .msg.{sender}, leak_flag 면 경고줄) 읽기 전용 · 우측 브랜드 액션 패널 + 요약(인플루언서 · 샘플 결제 · 배송지 · 운송장 · 기한)
	 *   액션: SAMPLE_REQUESTED → [승인] [거절](?/approve ?/reject) · SAMPLE_APPROVED/SAMPLE_PURCHASED → 택배사 + 송장 [발송 처리](?/ship) · TESTING → 테스트 중 D-n · SCHEDULE_PROPOSED → "일정 확정은 3단계"
	 *         · LIVE → 판매 링크 + "주문은 4단계" · 나머지는 안내 문구(원문).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { COURIERS, REJECT_REASON_MAX } from '@sellery/db/brand/campaign-rules';
	import { CampaignStepper, CopyButton, GradeBox, PlatformHandle, ProductIcon, SellerAvatar, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.campaign);
	const p = $derived(c.product);
	const s = $derived(c.seller);
	const sh = $derived(data.sample_shipping);
	const today = kstToday();
	const pct = (r: number) => (r * 100).toFixed(0);
	const dday = (iso: string) => daysBetween(today, iso);
	const who = (sender: string) => (sender === 'brand' ? data.brand.name : sender === 'admin' ? '셀러리 운영팀' : s.name);
	const LEAK_WARN = '⚠ 연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.';
	const inv = (k: string) => (form?.field === k ? 'invalid' : '');
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
			· 판매가 ₩{fmtNum(p.sale_price)} · 수수료 {pct(p.commission_rate)}%{#if c.start_date}{' '}· 기간 {md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'}{/if}
		</div>
		<CampaignStepper status={c.status} />
	</div>
	<div><StatusChip tone={c.chip.live ? 'live' : c.chip.tone}>{c.chip.label}</StatusChip></div>
</section>

<div class="console-det-body">
	<section class="card static console-thread" aria-label="캠페인 스레드">
		<div class="msgs">
			{#each data.events as e (e.id)}
				{#if e.kind === 'system'}
					<div class="sysline">{e.body} · {md(e.created_at)}</div>
				{:else}
					<div class="msg {e.sender}">
						<div class="who">{who(e.sender)}</div>
						{e.body}
						<div class="tm">{md(e.created_at)}</div>
					</div>
					{#if e.leak_flag}<div class="warnline">{LEAK_WARN}</div>{/if}
				{/if}
			{:else}
				<div class="sysline">대화가 없습니다</div>
			{/each}
		</div>
		<div class="composer">메시지 보내기는 3단계에서 열립니다 — 지금은 인플루언서·운영팀 메시지를 읽기만 할 수 있어요. 승인·일정은 우측 버튼으로.</div>
	</section>

	<div class="console-actions">
		{#if form?.message && !form.field}
			<p class="notice danger" role="alert">{form.message}</p>
		{/if}
		{#if c.status === 'SAMPLE_REQUESTED'}
			<div class="card static">
				<h4>샘플 요청 검토 <span class="chip brand">브랜드 액션</span></h4>
				<p class="hint"><PlatformHandle platform={s.platform} handle={s.handle} /> {s.name} · 팔로워 {fmtNum(s.followers)} · 등급 {s.grade ?? '스타터'}. 승인 시 배송지가 브랜드에 전달됩니다.</p>
				<div class="btnrow">
					<form method="post" action="?/approve"><button type="submit" class="pri">승인</button></form>
					<details class="console-reject">
						<summary class="btn danger">거절</summary>
						<form method="post" action="?/reject" class="console-form console-reject-form">
							<textarea name="reason" rows="2" maxlength={REJECT_REASON_MAX} placeholder="거절 사유 (선택 · 인플루언서에게 전달돼요 · {REJECT_REASON_MAX}자 이내)">{form?.values?.reason ?? ''}</textarea>
							<button type="submit" class="danger sm">거절 확정</button>
						</form>
					</details>
				</div>
			</div>
		{:else if c.status === 'INVITED'}
			<div class="card static"><h4>인플루언서 수락 대기 중 ⏳</h4><p class="hint">제안을 보냈어요. 인플루언서가 수락하면 샘플 발송 단계로 넘어갑니다 — 보통 48시간 내 응답해요.</p></div>
		{:else if c.status === 'DECLINED'}
			<div class="card static"><h4>제안 거절됨</h4><p class="hint">인플루언서가 이번 제안을 수락하지 않았습니다.</p></div>
		{:else if c.status === 'SAMPLE_PURCHASED' || c.status === 'SAMPLE_APPROVED'}
			<div class="card static">
				<h4>
					샘플 발송 <span class="chip brand">브랜드 액션</span>
					{#if c.status === 'SAMPLE_PURCHASED'}<span class="st green" style="animation:none">구매 완료 ₩{fmtNum(c.sample_price ?? 0)}</span>{/if}
				</h4>
				<p class="hint">
					{c.status === 'SAMPLE_PURCHASED' ? '인플루언서가 샘플을 구매했습니다(승인 불필요). ' : ''}택배사와 송장번호를 입력하면 배송 추적이 시작됩니다 — 인플루언서가 수령 확인을 하면 테스트({data.testDays}일)가 시작돼요.
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
							<option value="" selected={!form?.values?.courier} disabled>택배사 선택</option>
							{#each COURIERS as k (k)}<option value={k} selected={form?.values?.courier === k}>{k}</option>{/each}
						</select>
					</div>
					<div class="fld {inv('tracking_no')}">
						<label for="cd-track">송장번호</label>
						<input id="cd-track" name="tracking_no" value={form?.values?.tracking_no ?? ''} placeholder="예: 6890-1234-5678" inputmode="numeric" required />
						{#if form?.field}<div class="console-err" role="alert">{form.message}</div>{/if}
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
					까지 진행 여부를 응답합니다.
				</p>
			</div>
		{:else if c.status === 'SCHEDULE_PROPOSED'}
			<div class="card static">
				<h4>일정 승인 <span class="chip brand">브랜드 액션</span></h4>
				<p class="hint">제안 기간: <b>{c.proposed_start ? md(c.proposed_start) : '—'} – {c.proposed_end ? md(c.proposed_end) : '—'}</b> · 배정 재고 {fmtNum(c.proposed_qty ?? 0)}개. 승인하면 이 기간이 캘린더에 표시됩니다(플래티넘 이상이 잡은 기간은 상위 등급만 추가 진입).</p>
				<div class="btnrow">
					<button type="button" class="pri" disabled aria-disabled="true" style="opacity:.6" title="일정 확정은 3단계에서 열립니다">일정 승인</button>
					<button type="button" class="danger" disabled aria-disabled="true" style="opacity:.6" title="일정 확정은 3단계에서 열립니다">반려 (재제안 요청)</button>
				</div>
				<p class="hint" style="margin:8px 0 0">일정 확정·반려는 <b>3단계</b>에서 열립니다.</p>
			</div>
		{:else if c.status === 'SCHEDULE_CONFIRMED'}
			<div class="card static">
				<h4>판매 대기 중</h4>
				<p class="hint">시작 <b>{c.start_date ? md(c.start_date) : '—'}</b>{#if c.start_date}{' '}(D-{Math.max(dday(c.start_date), 0)}){/if} — 시작 시각에 링크가 자동 활성화됩니다.</p>
			</div>
		{:else if c.status === 'LIVE'}
			<div class="card static">
				<h4>판매 링크 <StatusChip tone="live">판매 진행중</StatusChip></h4>
				<p class="hint"><code>{data.storeDisplay}</code> · 종료 {c.end_date ? md(c.end_date) : '—'} · 판매 {fmtNum(c.sold_qty)}/{fmtNum(c.qty)}개</p>
				<div class="btnrow">
					<a href={data.storeUrl} class="btn pri" target="_blank" rel="noopener">판매 페이지 미리보기</a>
					<CopyButton text={data.storeUrl} label="링크 복사" />
				</div>
				<p class="hint" style="margin:8px 0 0">주문 · 발주서 · 운송장은 <b>4단계</b>(주문 탭)에서 열립니다.</p>
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
			<div class="card static"><h4>인플루언서 패스</h4><p class="hint">인플루언서가 테스트 후 진행하지 않기로 했습니다.</p></div>
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
						팔로워 {fmtNum(s.followers)}{#if s.primary_channel?.verified}{' '}· ✓ 인증 채널{/if}{#if s.primary_channel?.url}{' '}· <a href={s.primary_channel.url} target="_blank" rel="noopener">채널 보기 ↗</a>{/if}
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
				{#if c.proposed_start}<dt>제안 기간</dt><dd>{md(c.proposed_start)}–{c.proposed_end ? md(c.proposed_end) : '—'} · 재고 {fmtNum(c.proposed_qty ?? 0)}개</dd>{/if}
				{#if c.start_date}<dt>판매 기간</dt><dd>{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'} · 재고 {fmtNum(c.qty)}개</dd>{/if}
				{#if data.settleDue}<dt>정산 기준일</dt><dd>{md(data.settleDue)} (D+{data.clearDays})</dd>{/if}
				{#if c.decision_reason}<dt>거절 사유</dt><dd>{c.decision_reason}</dd>{/if}
			</dl>
		</div>
	</div>
</div>
