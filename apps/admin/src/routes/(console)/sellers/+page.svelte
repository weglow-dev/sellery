<script lang="ts">
	/**
	 * 인플루언서 목록 — 데모 `(demo)/influencers` 의 DB 판.
	 * UI 는 데모의 h2.pg · cats 칩 · dmsearch 느낌 · compact 표에 맞추되,
	 * 상태 필터 · 행 클릭 상세 · 공개/지급 form 액션은 콘솔 기능을 그대로 둔다.
	 */
	import { channelCountChip, sellerStatusChip } from '@sellery/db/admin/seller-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { GradeBox, PlatformHandle, SellerAvatar, StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const detail = (s: { code: string | null; id: string }) => `${data.self}/${encodeURIComponent(s.code ?? s.id)}`;
	const money = (n: number) => `₩${fmtNum(n)}`;

	/** 행 클릭 → 상세. 버튼·링크·폼 안을 누른 경우는 무시한다 */
	function rowClick(s: { code: string | null; id: string }) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			goto(detail(s));
		};
	}
	function rowKey(s: { code: string | null; id: string }) {
		return (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			e.preventDefault();
			goto(detail(s));
		};
	}
	const confirmGrant = (name: string) => (e: SubmitEvent) => {
		if (!confirm(`${name} 에게 🥬 를 지급할까요? 누를 때마다 원장에 적재되며 되돌리려면 운영 조정이 필요합니다.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>인플루언서 — 셀러리 관리자</title>
</svelte:head>

<h2 class="pg">
	인플루언서
	<small>
		가입 {data.counts.all}명 · 비공개 {data.counts.hidden} · 정지 {data.counts.suspended} · 채널 인증 대기 {data.counts.pendingChannel}
	</small>
</h2>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<div class="mini-stats admin-strip sellers-strip">
	<div>
		<span class="ms-l">가입</span>
		<span class="ms-v">{data.counts.all}</span>
		<span class="ms-s">전체 인플루언서</span>
	</div>
	<div>
		<span class="ms-l">채널 인증 대기</span>
		<span class="ms-v" style={data.counts.pendingChannel ? 'color:var(--color-danger)' : ''}>{data.counts.pendingChannel}</span>
		<span class="ms-s">
			{#if data.counts.pendingChannel}
				<a href="{data.self}?filter=pending_channel">대기 목록 보기 →</a>
			{:else}
				처리할 건 없음
			{/if}
		</span>
	</div>
	<div>
		<span class="ms-l">비공개</span>
		<span class="ms-v">{data.counts.hidden}</span>
		<span class="ms-s">갤러리·리더보드 숨김</span>
	</div>
	<div>
		<span class="ms-l">정지</span>
		<span class="ms-v" style={data.counts.suspended ? 'color:var(--color-danger)' : ''}>{data.counts.suspended}</span>
		<span class="ms-s">콘솔 입장 차단</span>
	</div>
</div>

<nav class="cats console-filters" aria-label="상태 필터">
	{#each data.statusChips as c (c.key)}
		<a
			href={c.href}
			class="catchip {c.key === data.filter ? 'on' : ''}"
			aria-current={c.key === data.filter ? 'page' : undefined}
		>
			{c.label}{#if c.count !== null}<span class="n"> {c.count}</span>{/if}
		</a>
	{/each}
</nav>

<nav class="cats console-filters sellers-grades" aria-label="등급 필터">
	{#each data.gradeChips as g (g.key)}
		<a
			href={g.href}
			class="catchip sm {(g.key || null) === data.grade ? 'on' : ''}"
			aria-current={(g.key || null) === data.grade ? 'page' : undefined}
		>
			{g.label}<span class="n"> {g.count}</span>
		</a>
	{/each}
</nav>

<form method="get" action={data.self} class="admin-search" role="search">
	{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
	{#if data.grade}<input type="hidden" name="grade" value={data.grade} />{/if}
	<input
		type="search"
		name="q"
		value={data.q}
		placeholder="이름 · 핸들 · 카테고리 · 소개 · 코드 · 이메일 검색"
		aria-label="인플루언서 검색"
	/>
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta sellers-count">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

<div class="tblw admin-table sellers-table">
	<table>
		<thead>
			<tr>
				<th>인플루언서</th>
				<th>등급</th>
				<th class="num">팔로워</th>
				<th class="num">3개월 매출</th>
				<th class="num">판매</th>
				<th>채널 인증</th>
				<th class="num">셀러리</th>
				<th>상태</th>
				<th>관리</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as s (s.id)}
				{@const chip = sellerStatusChip(s)}
				{@const cc = channelCountChip(s)}
				<tr
					class="clickable"
					onclick={rowClick(s)}
					onkeydown={rowKey(s)}
					tabindex="0"
					role="link"
					aria-label="{s.name} 상세"
				>
					<td class="nm" data-l="인플루언서">
						<span class="sellers-cell">
							<SellerAvatar avatarUrl={s.avatar_url} size={26} />
							<span class="sellers-cell-text">
								<a href={detail(s)}><b>{s.name}</b></a>
								<span class="sellers-handle">
									<PlatformHandle platform={s.platform} handle={s.handle} />
									{#if s.code}<span class="console-mono meta"> {s.code}</span>{/if}
								</span>
								<span class="sellers-intro">{[s.category, s.intro].filter(Boolean).join(' · ') || '—'}</span>
							</span>
						</span>
					</td>
					<td data-l="등급"><GradeBox grade={s.grade} sm /></td>
					<td class="num" data-l="팔로워">{fmtNum(s.followers)}</td>
					<td class="num" data-l="3개월 매출"><b>{money(s.m3_sales)}</b></td>
					<td class="num" data-l="판매">
						{s.campaigns_done}<span class="meta">/{s.campaigns_total}</span>
					</td>
					<td data-l="채널 인증">
						{#if cc}
							<StatusChip tone={cc.tone}>{cc.label}</StatusChip>
						{:else}
							<span class="meta">—</span>
						{/if}
					</td>
					<td class="num" data-l="셀러리">🥬 {s.celery}</td>
					<td data-l="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></td>
					<td data-l="관리" class="admin-row-act">
						<div class="sellers-acts">
							<form method="post" action="?/hidden">
								<input type="hidden" name="seller" value={s.code ?? s.id} />
								<input type="hidden" name="hidden" value={s.hidden ? 'false' : 'true'} />
								<button type="submit" class="ghost sm">{s.hidden ? '공개 전환' : '비공개 전환'}</button>
							</form>
							<form method="post" action="?/grant" onsubmit={confirmGrant(s.name)}>
								<input type="hidden" name="seller" value={s.code ?? s.id} />
								<button type="submit" class="ghost sm">🥬 +3 지급</button>
							</form>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="9" class="empty">
						{data.q ? `"${data.q}" 에 맞는 인플루언서가 없어요.` : '해당하는 인플루언서가 없어요.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.sellers-strip {
		margin: 0 3px 16px;
	}
	.sellers-grades {
		margin-top: -6px;
	}
	.sellers-count {
		white-space: nowrap;
		font-size: 12px;
	}
	.sellers-table td {
		vertical-align: top;
	}
	.sellers-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.sellers-cell-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.sellers-handle {
		font-size: 12px;
		color: var(--color-mute);
	}
	.sellers-intro {
		display: block;
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.45;
	}
	.sellers-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.sellers-acts form {
		margin: 0;
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover td {
		background: color-mix(in srgb, var(--color-lime) 12%, transparent);
	}
</style>
