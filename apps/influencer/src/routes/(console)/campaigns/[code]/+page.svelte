<script lang="ts">
	/**
	 * 캠페인 상세 — 프로토타입 vCampDetail(js/70-campaign.js) · `packages/ui/src/views/CampaignDetail.svelte` 의 인플루언서 분기를 props 로 이식.
	 *   머리: 상품 아이콘 · 상품명 · 코드 · 브랜드 × 나 · 판매가 · 수수료 · 기간 · 스테퍼 · 상태 칩
	 *   본문: 스레드(campaign_events — system 은 .sysline, chat 은 .msg.{sender}, leak_flag 면 경고줄) 읽기 전용 · 우측 액션 패널(detActions seller 분기) + 요약(배송지 · 기한)
	 *   액션: SAMPLE_SHIPPED → [수령 확인](?/receive) · TESTING → 기한 + "일정 제안은 다음 단계" · LIVE → 판매 링크 복사 · 나머지는 안내 문구(원문).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { daysBetween, kstToday, md } from '@sellery/db/dates';
	import { payLine, samplePaidLine } from '@sellery/db/partner/sample-rules';
	import { CampaignStepper, CopyButton, PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const c = $derived(data.campaign);
	const p = $derived(c.product);
	const today = kstToday();
	const pct = (r: number) => (r * 100).toFixed(0);
	const dday = (iso: string) => daysBetween(today, iso);
	const who = (sender: string) => (sender === 'brand' ? c.brand.name : sender === 'admin' ? '셀러리 운영팀' : data.seller.name);
	const LEAK_WARN = '⚠ 연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.';
	const sh = $derived(data.sample_shipping);
	/** "샘플 결제 ₩75,650 (🥬 3 + ₩15,650)" — 구매 캠페인만 (4단계 · sample-rules samplePaidLine) */
	const paidLine = $derived(samplePaidLine(c));
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
		<div class="composer">메시지 보내기는 다음 단계에서 열립니다 — 지금은 브랜드·운영팀 메시지를 읽기만 할 수 있어요.</div>
	</section>

	<div class="console-actions">
		{#if c.status === 'SAMPLE_REQUESTED'}
			<div class="card static"><h4>브랜드 승인 대기 중 ⏳</h4><p class="hint">샘플 요청이 접수됐어요. 브랜드가 프로필을 검토 중입니다 — 보통 24시간 내 응답해요.</p></div>
		{:else if c.status === 'INVITED'}
			<div class="card static">
				<h4>브랜드 직접 제안 <span class="chip seller">인플루언서 액션</span></h4>
				<p class="hint"><b>{c.brand.name}</b>가 <b>{p.name}</b> 판매를 제안했어요 · 수수료 {pct(p.commission_rate)}% · 수락 시 샘플 발송 단계부터 시작됩니다 (무상 · 이달 한도 미차감).</p>
				<div class="btnrow">
					<button type="button" class="pri" disabled aria-disabled="true" style="opacity:.6" title="수락·거절은 다음 단계에서 열립니다">수락 → 샘플 받기</button>
					<button type="button" disabled aria-disabled="true" style="opacity:.6" title="수락·거절은 다음 단계에서 열립니다">거절</button>
				</div>
				<p class="hint" style="margin:8px 0 0">수락·거절은 <b>다음 단계</b>에서 열립니다.</p>
			</div>
		{:else if c.status === 'DECLINED'}
			<div class="card static"><h4>제안 거절됨</h4><p class="hint">인플루언서가 이번 제안을 수락하지 않았습니다.</p></div>
		{:else if c.status === 'SAMPLE_PURCHASED'}
			<div class="card static">
				<h4>결제 완료 · 샘플 발송 준비 중 ⏳</h4>
				<p class="hint">{paidLine || '샘플 구매'} — 브랜드가 발송하면 운송장이 표시됩니다. 발송 전에는 고객센터로 취소를 요청할 수 있어요.</p>
			</div>
		{:else if c.status === 'SAMPLE_APPROVED'}
			<div class="card static"><h4>샘플 발송 준비 중 ⏳</h4><p class="hint">브랜드가 요청을 승인했어요. 샘플이 발송되면 운송장이 여기 표시됩니다.</p></div>
		{:else if c.status === 'SAMPLE_SHIPPED'}
			<div class="card static">
				<h4>샘플 수령 확인 <span class="chip seller">인플루언서 액션</span></h4>
				<p class="hint">운송장 <b>{c.tracking_no || '—'}</b> · 수령 확인 시 테스트 기한 {data.testDays}일이 시작됩니다.</p>
				<form method="post" action="?/receive" class="btnrow">
					<button type="submit" class="pri">수령 확인</button>
				</form>
			</div>
		{:else if c.status === 'TESTING'}
			<div class="card static">
				<h4>테스트 후 진행 결정 <span class="chip seller">인플루언서 액션</span></h4>
				<p class="hint">
					기한 <b>{c.test_due ? md(c.test_due) : '—'}</b>{#if c.test_due}
						{@const left = dday(c.test_due)}
						{#if !Number.isNaN(left)}{' '}({left < 0 ? '기한 지남' : left === 0 ? '오늘 마감' : `D-${left}`}){/if}{/if}
					까지. 진행 시 판매 일정을 제안합니다.
				</p>
				<div class="btnrow">
					<button type="button" class="pri" disabled aria-disabled="true" style="opacity:.6" title="일정 제안은 다음 단계에서 열립니다">진행할게요 → 일정 제안</button>
					<button type="button" disabled aria-disabled="true" style="opacity:.6" title="다음 단계에서 열립니다">이번엔 패스</button>
				</div>
				<p class="hint" style="margin:8px 0 0">일정 제안·패스는 <b>다음 단계</b>(브랜드 콘솔과 함께)에서 열립니다.</p>
			</div>
		{:else if c.status === 'SCHEDULE_PROPOSED'}
			<div class="card static">
				<h4>브랜드 일정 승인 대기 ⏳</h4>
				<p class="hint">제안한 기간 <b>{c.proposed_start ? md(c.proposed_start) : '—'} – {c.proposed_end ? md(c.proposed_end) : '—'}</b> · 재고 {fmtNum(c.proposed_qty ?? 0)}개를 브랜드가 검토 중이에요.</p>
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
				<p class="hint">정산 명세와 지급 내역은 <b>5단계</b> 매출·정산 화면에서 열립니다. 성과가 좋았다면 같은 조합으로 바로 재판매를 열 수 있습니다(다음 단계).</p>
			</div>
		{:else if c.status === 'REJECTED'}
			<div class="card static"><h4>거절된 요청</h4><p class="hint">브랜드가 이번 요청을 승인하지 않았습니다.{c.decision_reason ? ` 사유: ${c.decision_reason}` : ''}</p></div>
		{:else if c.status === 'PASSED'}
			<div class="card static"><h4>인플루언서 패스</h4><p class="hint">인플루언서가 테스트 후 진행하지 않기로 했습니다.</p></div>
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
				{#if c.tracking_no}<dt>운송장</dt><dd>{c.tracking_no}</dd>{/if}
				{#if c.received_at}<dt>수령 확인</dt><dd>{md(c.received_at)}</dd>{/if}
				{#if c.test_due}<dt>테스트 기한</dt><dd>{md(c.test_due)}</dd>{/if}
				{#if c.start_date}<dt>판매 기간</dt><dd>{md(c.start_date)}–{c.end_date ? md(c.end_date) : '—'} · 재고 {fmtNum(c.qty)}개</dd>{/if}
				{#if data.settleDue}<dt>정산 기준일</dt><dd>{md(data.settleDue)} (D+{data.clearDays})</dd>{/if}
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
