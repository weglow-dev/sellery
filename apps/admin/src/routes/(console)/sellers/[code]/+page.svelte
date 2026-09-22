<script lang="ts">
	/**
	 * 인플루언서 상세 — 프로필 · 채널 목록 · 운영 액션(정지/복귀 · 비공개/공개 · 채널 인증 승인/해제).
	 * UI 는 목록(`sellers/+page`) · 주문 상세와 같은 console-det / kv / actions 톤.
	 * 인증 승인 전에 운영자가 프로필 bio 또는 @sellery.official DM 에서 코드를 직접 확인해야 한다(0010 계약).
	 */
	import { HIDDEN_LABELS, accountLinkLabel, channelPendingSince, channelStatusChip, isChannelPending, sellerStatusChip } from '@sellery/db/admin/seller-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { GradeBox, PlatformHandle, SellerAvatar, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const s = $derived(data.seller);
	const chip = $derived(sellerStatusChip(s));
	const pendingN = $derived(data.channels.filter(isChannelPending).length);
	const verifiedN = $derived(data.channels.filter((c) => c.verified).length);
	const money = (n: number) => `₩${fmtNum(n)}`;
	const ask = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>{s.name} — 인플루언서 · 셀러리 관리자</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm seller-back">← 인플루언서</a>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<section class="card static console-det">
	<SellerAvatar avatarUrl={s.avatar_url} size={52} />
	<div class="grow">
		<div class="t">
			{s.name}
			{#if s.code}<small>· {s.code}</small>{/if}
		</div>
		<div class="meta">
			<PlatformHandle platform={s.platform} handle={s.handle} />
			{#if s.category} · {s.category}{/if}
			{#if s.intro} · {s.intro}{/if}
		</div>
		<div class="seller-det-tags">
			<GradeBox grade={s.grade} sm />
			<span class="meta">팔로워 {fmtNum(s.followers)} · 3개월 {money(s.m3_sales)} · 🥬 {data.celery}</span>
		</div>
	</div>
	<div class="admin-det-status">
		<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
		{#if pendingN}
			<StatusChip tone="amber">인증 대기 {pendingN}</StatusChip>
		{/if}
	</div>
</section>

<div class="mini-stats admin-strip seller-det-strip">
	<div>
		<span class="ms-l">3개월 매출</span>
		<span class="ms-v">{money(s.m3_sales)}</span>
		<span class="ms-s">등급 산정 근거</span>
	</div>
	<div>
		<span class="ms-l">채널 인증</span>
		<span class="ms-v" style={pendingN ? 'color:var(--color-danger)' : ''}>{verifiedN}/{data.channels.length}</span>
		<span class="ms-s">{pendingN ? `대기 ${pendingN}건` : data.channels.length ? '전부 인증' : '채널 없음'}</span>
	</div>
	<div>
		<span class="ms-l">셀러리</span>
		<span class="ms-v">🥬 {data.celery}</span>
		<span class="ms-s">관리자 지급 가능</span>
	</div>
	<div>
		<span class="ms-l">가입</span>
		<span class="ms-v">{md(s.created_at)}</span>
		<span class="ms-s">{s.email ?? '이메일 없음'}</span>
	</div>
</div>

<div class="console-det-body admin-det-body">
	<div>
		<section class="card static">
			<h4 class="admin-h4">프로필</h4>
			<dl class="console-kv">
				<dt>메인 채널</dt>
				<dd><PlatformHandle platform={s.platform} handle={s.handle} /> · 팔로워 {fmtNum(s.followers)}</dd>
				<dt>카테고리</dt>
				<dd>{s.category ?? '—'}</dd>
				<dt>소개</dt>
				<dd>{s.intro ?? '—'}</dd>
				<dt>등급</dt>
				<dd>
					<GradeBox grade={s.grade} sm />
					<span class="meta"> 최근 3개월 확정 매출로 매달 재계산 — 여기서 바꾸지 않습니다</span>
				</dd>
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

		<section class="card static">
			<h4 class="admin-h4">
				채널
				<span class="meta">{data.channels.length}건{#if pendingN} · 대기 {pendingN}{/if}</span>
			</h4>
			<p class="hint seller-channel-hint">
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
								{@const pending = isChannelPending(c)}
								<tr class={pending ? 'row-due' : ''}>
									<td data-l="채널">
										<PlatformHandle platform={c.platform} handle={c.handle} />
										{#if c.url}
											<a href={c.url} target="_blank" rel="noopener noreferrer nofollow" class="meta"> 열기 ↗</a>
										{/if}
										{#if c.code}<span class="console-mono meta"> {c.code}</span>{/if}
									</td>
									<td class="num" data-l="팔로워">{fmtNum(c.followers)}</td>
									<td data-l="메인">{#if c.is_primary}✓{:else}<span class="meta">—</span>{/if}</td>
									<td data-l="상태">
										<StatusChip tone={cc.tone}>{cc.label}</StatusChip>
										{#if days !== null}
											<small>{days === 0 ? '오늘부터 대기' : `${days}일 대기`}</small>
										{/if}
									</td>
									<td data-l="1회용 코드" class="console-mono">{c.vcode ?? '—'}</td>
									<td data-l="" class="admin-row-act">
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
												<button
													type="submit"
													class="pri sm"
													disabled={!c.vcode_confirmed_at}
													title={c.vcode_confirmed_at ? '' : '인플루언서가 [인증 확인] 을 누르기 전입니다'}
												>
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
	</div>

	<div class="console-actions">
		<div class="card static">
			<h4>콘솔 입장</h4>
			<p class="hint">
				{#if s.active}
					정지하면 다음 요청부터 콘솔에 들어올 수 없고 <code>/influencer/suspended</code> 로 보내집니다. 진행 중인 캠페인은 그대로 남습니다.
				{:else}
					정지 상태입니다. 풀면 바로 콘솔에 들어올 수 있습니다.
				{/if}
			</p>
			{#if s.active}
				<form method="post" action="?/active" class="seller-suspend" onsubmit={ask(`${s.name} 을 정지할까요? 다음 요청부터 콘솔에 들어올 수 없습니다.`)}>
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

		<div class="card static">
			<h4>프로필 공개</h4>
			<p class="hint">{s.hidden ? HIDDEN_LABELS.hidden : HIDDEN_LABELS.shown}</p>
			<form method="post" action="?/hidden">
				<input type="hidden" name="hidden" value={s.hidden ? 'false' : 'true'} />
				<button type="submit" class="ghost sm">{s.hidden ? HIDDEN_LABELS.show : HIDDEN_LABELS.hide}</button>
			</form>
		</div>

		<div class="card static">
			<h4>🥬 관리자 지급</h4>
			<p class="hint">이벤트·보상 지급. 누를 때마다 원장(<code>admin_grant</code>)에 적재되며 되돌리려면 운영 조정이 필요합니다.</p>
			<form method="post" action="?/grant" onsubmit={ask(`${s.name} 에게 🥬 를 지급할까요? 되돌리려면 운영 조정이 필요합니다.`)}>
				<button type="submit" class="ghost sm">🥬 +3 지급</button>
			</form>
		</div>
	</div>
</div>

<style>
	.seller-back {
		margin: 0 3px 12px;
	}
	.seller-det-tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
	.seller-det-strip {
		margin: 12px 3px 4px;
	}
	.seller-channel-hint {
		font-size: 12.5px;
		color: var(--color-mute);
		margin: 0 0 14px;
		line-height: 1.6;
	}
	.seller-channel-hint b {
		color: var(--color-ink);
	}
	.seller-channel-hint code {
		font-family: var(--font-mono);
		font-size: 11.5px;
		background: var(--color-surface-2);
		padding: 2px 6px;
	}
	.seller-suspend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		margin: 0;
	}
	.seller-suspend input[type='text'] {
		flex: 1 1 160px;
		min-width: 0;
	}
	.console-actions form {
		margin: 0;
	}
</style>
