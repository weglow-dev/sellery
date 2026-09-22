<script lang="ts">
	/**
	 * 인플루언서 상세 — 프로필 · 채널 목록 · 운영 액션(정지/복귀 · 비공개/공개 · 채널 인증 승인/해제).
	 * 지금까지 `partner-admin.mjs suspend|reactivate|verify-channel|unverify-channel` 로 하던 일이다.
	 *   채널 표: 플랫폼·핸들 · URL · 팔로워 · 메인 · 상태칩 · 1회용 코드(vcode) · 대기 일수 · [인증 완료]/[인증 해제]
	 *   인증 승인 전에 운영자가 **프로필 bio 또는 @sellery.official DM 에서 코드를 직접 확인**해야 한다(0010 계약) — 안내 문구로 남긴다.
	 * 되돌리기 어려운 액션(정지 · 인증 해제)은 confirm 을 건다.
	 */
	import { HIDDEN_LABELS, accountLinkLabel, channelPendingSince, channelStatusChip, sellerStatusChip } from '@sellery/db/admin/seller-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { PlatformHandle, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.seller);
	const chip = $derived(sellerStatusChip(s));
	const ask = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>{s.name} — 인플루언서 · 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<a href={data.listPath} class="btn ghost sm">← 목록</a>
	<h2>{s.name}</h2>
	<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
	{#if s.code}<span class="console-mono meta">{s.code}</span>{/if}
</div>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<!-- ---------------- 프로필 ---------------- -->
<section class="card static">
	<h4>프로필</h4>
	<dl class="console-dl">
		<dt>메인 채널</dt>
		<dd><PlatformHandle platform={s.platform} handle={s.handle} /> · 팔로워 {fmtNum(s.followers)}</dd>
		<dt>카테고리</dt>
		<dd>{s.category ?? '—'}</dd>
		<dt>등급</dt>
		<dd>{s.grade ?? '—'} <span class="meta">최근 3개월 확정 매출로 매달 재계산 — 여기서 바꾸지 않습니다</span></dd>
		<dt>이메일</dt>
		<dd>{s.email ?? '—'}</dd>
		<dt>계정 연결</dt>
		<dd>
			{accountLinkLabel(s.user_id)}
			{#if !s.user_id}
				<span class="meta">미연결 — 초대는 <code>partner-admin.mjs invite &lt;email&gt; --link {s.code ?? s.id}</code></span>
			{/if}
		</dd>
		<dt>셀러리</dt>
		<dd>🥬 {data.celery}</dd>
		<dt>가입일</dt>
		<dd>{md(s.created_at)}</dd>
	</dl>
</section>

<!-- ---------------- 운영 ---------------- -->
<section class="card static">
	<h4>운영</h4>

	<div class="console-act">
		<div>
			<b>콘솔 입장</b>
			<p class="meta">
				{s.active
					? '정지하면 다음 요청부터 콘솔에 들어올 수 없고 /influencer/suspended 로 보내집니다. 진행 중인 캠페인은 그대로 남습니다.'
					: '정지 상태입니다. 풀면 바로 콘솔에 들어올 수 있습니다.'}
			</p>
		</div>
		{#if s.active}
			<form method="post" action="?/active" onsubmit={ask(`${s.name} 을 정지할까요? 다음 요청부터 콘솔에 들어올 수 없습니다.`)}>
				<input type="hidden" name="active" value="false" />
				<input type="text" name="reason" placeholder="사유 (Slack 알림에만 · 저장 안 됨)" maxlength="200" aria-label="정지 사유" />
				<button type="submit" class="danger sm">정지</button>
			</form>
		{:else}
			<form method="post" action="?/active">
				<input type="hidden" name="active" value="true" />
				<button type="submit" class="pri sm">정지 해제</button>
			</form>
		{/if}
	</div>

	<div class="console-act">
		<div>
			<b>🥬 관리자 지급</b>
			<p class="meta">이벤트·보상 지급. 누를 때마다 원장(<code>admin_grant</code>)에 적재되며 되돌리려면 운영 조정이 필요합니다.</p>
		</div>
		<form method="post" action="?/grant" onsubmit={ask(`${s.name} 에게 🥬 를 지급할까요? 되돌리려면 운영 조정이 필요합니다.`)}>
			<button type="submit" class="ghost sm">🥬 +3 지급</button>
		</form>
	</div>

	<div class="console-act">
		<div>
			<b>프로필 공개</b>
			<p class="meta">{s.hidden ? HIDDEN_LABELS.hidden : HIDDEN_LABELS.shown}</p>
		</div>
		<form method="post" action="?/hidden">
			<input type="hidden" name="hidden" value={s.hidden ? 'false' : 'true'} />
			<button type="submit" class="ghost sm">{s.hidden ? HIDDEN_LABELS.show : HIDDEN_LABELS.hide}</button>
		</form>
	</div>
</section>

<!-- ---------------- 채널 ---------------- -->
<section class="card static">
	<h4>채널 <span class="meta">{data.channels.length}건</span></h4>
	<p class="meta">
		인증 승인 전에 인플루언서의 <b>프로필 bio 또는 @sellery.official DM 수신함</b>에서 1회용 코드를 직접 확인하세요.
		[인증 확인] 은 인플루언서가 누른 것이고, <code>verified</code> 로 바꾸는 것은 운영자만 할 수 있습니다.
	</p>

	{#if data.channels.length === 0}
		<p class="notice" role="status">등록된 채널이 없습니다.</p>
	{:else}
		<div class="tblw admin-table">
			<table>
				<thead>
					<tr>
						<th>채널</th>
						<th class="num">팔로워</th>
						<th>메인</th>
						<th>상태</th>
						<th>1회용 코드</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.channels as c (c.id)}
						{@const cc = channelStatusChip(c)}
						{@const days = channelPendingSince(c)}
						<tr>
							<td data-label="채널">
								<PlatformHandle platform={c.platform} handle={c.handle} />
								{#if c.url}<a href={c.url} target="_blank" rel="noopener noreferrer nofollow" class="meta">열기 ↗</a>{/if}
								{#if c.code}<span class="console-mono meta"> {c.code}</span>{/if}
							</td>
							<td data-label="팔로워" class="num">{fmtNum(c.followers)}</td>
							<td data-label="메인">{c.is_primary ? '✓' : ''}</td>
							<td data-label="상태">
								<StatusChip tone={cc.tone}>{cc.label}</StatusChip>
								{#if days !== null}<span class="meta"> {days === 0 ? '오늘' : `${days}일 대기`}</span>{/if}
							</td>
							<td data-label="1회용 코드" class="console-mono">{c.vcode ?? '—'}</td>
							<td data-label="">
								{#if c.verified}
									<form method="post" action="?/channel" onsubmit={ask('인증을 해제할까요? 사칭이 확인된 경우에만 사용하세요. 메인 채널 설정은 유지됩니다.')}>
										<input type="hidden" name="channel" value={c.id} />
										<input type="hidden" name="verified" value="false" />
										<button type="submit" class="ghost sm">인증 해제</button>
									</form>
								{:else}
									<form method="post" action="?/channel">
										<input type="hidden" name="channel" value={c.id} />
										<input type="hidden" name="verified" value="true" />
										<button type="submit" class="pri sm" disabled={!c.vcode_confirmed_at} title={c.vcode_confirmed_at ? '' : '인플루언서가 [인증 확인] 을 누르기 전입니다'}>
											인증 완료
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
