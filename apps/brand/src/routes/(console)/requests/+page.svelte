<script lang="ts">
	/**
	 * 처리 대기 큐 — 프로토타입 브랜드 홈 "승인·처리 대기" 행(인플루언서 · 등급 · 팔로워 · 할 일 라벨 · 버튼) + CampaignDetail 브랜드 액션 카드(승인·거절 · 발송 처리) 를 행 카드 하나로.
	 * 행마다: 인플루언서(아바타 · 이름 · 핸들 · 등급 · 팔로워 · ✓ 인증 채널) · 상품 · 요청일 · 샘플 구분(무상 · 구매 결제 · 브랜드 제안) · 배송지 등록 여부 · 상태 칩 → 액션(action.kind).
	 *   approve: [승인] · [거절](사유 textarea — details 로 접힘) · ship: 택배사 셀렉트 + 송장 + [발송 처리] · confirm_schedule(3단계 · 0016): 제안 기간 · 배정/잔여 재고 + [확정](confirm) · [반려](사유 — details).
	 * 실패한 발송 제출은 `form`(fail 400 · code 일치 행)으로 값 유지 · 필드 강조. 인플루언서 배송지 원문은 상세(`/campaigns/<code>`)에서만.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { COURIERS, REJECT_REASON_MAX } from '@sellery/db/brand/campaign-rules';
	import { GradeBox, PlatformHandle, ProductIcon, SellerAvatar, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pct = (r: number) => (r * 100).toFixed(0);
	const failFor = (code: string) => (form && form.code === code ? form : null);
</script>

<svelte:head>
	<title>처리 대기 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>승인 · 처리 대기</h2>
	{#if data.requests.length}<span class="badge">{data.requests.length}</span>{/if}
	<span class="meta">샘플 요청 검토 · 샘플 발송 · 일정 승인 — 오래된 요청부터</span>
	<a href={data.campaignsPath} class="btn ghost sm" style="margin-left:auto">내 캠페인 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<div class="listcard console-rows console-reqs">
	{#each data.requests as c (c.code)}
		{@const f = failFor(c.code)}
		{@const s = c.seller}
		{@const ch = s.primary_channel}
		<div class="rowitem console-req">
			<SellerAvatar avatarUrl={s.avatar_url} size={40} />
			<div class="grow">
				<div class="nm">
					<GradeBox grade={s.grade} sm />
					{s.name}
					<span class="sub"><PlatformHandle platform={s.platform} handle={s.handle} /></span>
					{#if ch?.verified}<span class="chip plat" title="채널 인증 완료">✓ 인증 채널</span>{/if}
					<StatusChip tone={c.chip.tone}>{c.chip.label}</StatusChip>
				</div>
				<div class="sub">
					팔로워 {fmtNum(s.followers)}{#if ch && ch.followers && ch.followers !== s.followers}{' '}(채널 {fmtNum(ch.followers)}){/if} · 요청 {md(c.created_at)}
					· {c.invited ? '브랜드 제안' : c.paidLine || '무상 샘플'}{#if c.has_shipping}{' '}· 배송지 등록됨{/if}
				</div>
				<div class="sub console-req-prod">
					<a href={c.href} class="console-cell-prod">
						<ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={24} />
						<b>{c.product.name}</b>
					</a>
					· ₩{fmtNum(c.product.sale_price)} · 수수료 {pct(c.product.commission_rate)}%{#if c.product.sample_text}{' '}· 샘플 {c.product.sample_text}{/if}
				</div>
				<div class="hintline">→ {c.action.label} <span class="meta">— {c.action.hint}</span></div>
				{#if f}<div class="console-err" role="alert">{f.message}</div>{/if}
			</div>

			{#if c.action.kind === 'approve'}
				<div class="rowacts">
					<form method="post" action="?/approve">
						<input type="hidden" name="code" value={c.code} />
						<button type="submit" class="pri sm">승인</button>
					</form>
					<details class="console-reject">
						<summary class="btn danger sm">거절</summary>
						<form method="post" action="?/reject" class="console-form console-reject-form">
							<input type="hidden" name="code" value={c.code} />
							<textarea name="reason" rows="2" maxlength={REJECT_REASON_MAX} placeholder="거절 사유 (선택 · 인플루언서에게 전달돼요 · {REJECT_REASON_MAX}자 이내)">{f?.values.reason ?? ''}</textarea>
							<button type="submit" class="danger sm">거절 확정</button>
						</form>
					</details>
					<a href={c.href} class="btn ghost sm">상세</a>
				</div>
			{:else if c.action.kind === 'ship'}
				<form method="post" action="?/ship" class="rowacts console-form console-shipform">
					<input type="hidden" name="code" value={c.code} />
					<div class="fld {f?.field === 'courier' ? 'invalid' : ''}">
						<select name="courier" aria-label="택배사" required>
							<option value="" selected={!f?.values.courier} disabled>택배사</option>
							{#each COURIERS as k (k)}<option value={k} selected={f?.values.courier === k}>{k}</option>{/each}
						</select>
					</div>
					<div class="fld {f?.field === 'tracking_no' ? 'invalid' : ''}">
						<input name="tracking_no" value={f?.values.tracking_no ?? ''} placeholder="송장번호 (예: 6890-1234-5678)" inputmode="numeric" required aria-label="송장번호" />
					</div>
					<button type="submit" class="pri sm">발송 처리</button>
					<a href={c.href} class="btn ghost sm">상세</a>
				</form>
			{:else if c.action.kind === 'confirm_schedule'}
				{@const short = (c.proposed_qty ?? 0) > c.stock_left}
				<div class="rowacts console-schedacts">
					<span class="meta console-mono">
						{c.proposed_start ? md(c.proposed_start) : '—'}–{c.proposed_end ? md(c.proposed_end) : '—'} · 배정 {fmtNum(c.proposed_qty ?? 0)}
						<span class={short ? 'console-danger' : ''}>(잔여 {fmtNum(c.stock_left)})</span>
					</span>
					<form method="post" action="?/confirm" onsubmit={(e) => { if (!confirm(`${c.product.name} · ${c.proposed_start ? md(c.proposed_start) : '—'}–${c.proposed_end ? md(c.proposed_end) : '—'} · 배정 ${fmtNum(c.proposed_qty ?? 0)}개로 확정할까요? 판매가 · 수수료율이 지금 값으로 잠겨요.`)) e.preventDefault(); }}>
						<input type="hidden" name="code" value={c.code} />
						<button type="submit" class="pri sm">확정</button>
					</form>
					<details class="console-reject">
						<summary class="btn danger sm">반려</summary>
						<form method="post" action="?/rejectSchedule" class="console-form console-reject-form">
							<input type="hidden" name="code" value={c.code} />
							<textarea name="reason" rows="2" maxlength={REJECT_REASON_MAX} placeholder="반려 사유 (선택 · 인플루언서에게 전달돼요 · {REJECT_REASON_MAX}자 이내)"></textarea>
							<button type="submit" class="danger sm">반려 확정</button>
						</form>
					</details>
					<a href={c.href} class="btn ghost sm">상세</a>
				</div>
			{:else}
				<div class="rowacts"><a href={c.href} class="btn ghost sm">상세</a></div>
			{/if}
		</div>
	{:else}
		<div class="empty" style="padding:24px">대기 중인 요청이 없습니다 ✓<div class="meta" style="margin-top:8px">인플루언서가 샘플을 요청하면 여기에 쌓여요 — 보통 24시간 안에 응답해주세요.</div></div>
	{/each}
</div>
