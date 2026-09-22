<script lang="ts">
	/**
	 * 인플루언서 목록 — 데모 `(demo)/influencers`(프로토타입 `vAdminSellers`) 의 DB 판.
	 *   상단 띠: 가입 · 비공개 · 정지 · 채널 인증 대기.
	 *   필터: 상태 칩(전체·활동 중·정지·비공개·인증 대기) + 등급 칩(GRADES 순서 · 인원 있는 등급만) + 검색.
	 *   표(3개월 매출 내림차순): 인플루언서(아바타·핸들·카테고리·소개) · 등급 · 팔로워 · 3개월 매출 · 판매 n/m ·
	 *      채널 인증 n/m · 🥬 · 상태 · 관리([공개/비공개 전환] · [🥬 +N 지급]).
	 *   **행 전체가 상세 링크**다 — 관리 칸의 버튼은 `stopPropagation` 으로 행 이동을 막는다.
	 *   정지 · 채널 인증 승인은 목록에 두지 않는다(상세에서만) — 되돌리기 비용이 큰 조작이다.
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

<div class="console-head">
	<h2>인플루언서</h2>
	<span class="meta">
		가입 {data.counts.all}명 · 비공개 {data.counts.hidden} · 정지 {data.counts.suspended} · 채널 인증 대기 {data.counts.pendingChannel}
	</span>
	{#if data.counts.pendingChannel}<span class="badge">인증 대기 {data.counts.pendingChannel}</span>{/if}
</div>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<div class="console-filters">
	{#each data.statusChips as c (c.key)}
		<a href={c.href} class={c.key === data.filter ? 'chip on' : 'chip'}>
			{c.label}{#if c.count !== null}<b> {c.count}</b>{/if}
		</a>
	{/each}
</div>
<div class="console-filters">
	{#each data.gradeChips as g (g.key)}
		<a href={g.href} class={(g.key || null) === data.grade ? 'chip on' : 'chip'}>{g.label}<b> {g.count}</b></a>
	{/each}
</div>

<form method="get" action={data.self} class="console-search">
	{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
	{#if data.grade}<input type="hidden" name="grade" value={data.grade} />{/if}
	<input type="search" name="q" value={data.q} placeholder="이름 · 핸들 · 카테고리 · 소개 · 코드 · 이메일 검색" aria-label="인플루언서 검색" />
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

{#if data.rows.length === 0}
	<p class="notice" role="status">{data.q ? `"${data.q}" 에 맞는 인플루언서가 없어요.` : '해당하는 인플루언서가 없어요.'}</p>
{:else}
	<div class="tblw admin-table">
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
					<tr class="clickable" onclick={rowClick(s)} onkeydown={rowKey(s)} tabindex="0" role="link" aria-label="{s.name} 상세">
						<td data-label="인플루언서">
							<span class="admin-seller-cell">
								<SellerAvatar avatarUrl={s.avatar_url} size={26} />
								<span>
									<a href={detail(s)}><b>{s.name}</b></a>
									<PlatformHandle platform={s.platform} handle={s.handle} />
									{#if s.code}<span class="console-mono meta"> {s.code}</span>{/if}
									<span class="meta admin-seller-intro">{[s.category, s.intro].filter(Boolean).join(' · ') || '—'}</span>
								</span>
							</span>
						</td>
						<td data-label="등급"><GradeBox grade={s.grade} sm /></td>
						<td data-label="팔로워" class="num">{fmtNum(s.followers)}</td>
						<td data-label="3개월 매출" class="num"><b>{money(s.m3_sales)}</b></td>
						<td data-label="판매" class="num">{s.campaigns_done}<span class="meta">/{s.campaigns_total}</span></td>
						<td data-label="채널 인증">
							{#if cc}<StatusChip tone={cc.tone}>{cc.label}</StatusChip>{:else}<span class="meta">—</span>{/if}
						</td>
						<td data-label="셀러리" class="num">🥬 {s.celery}</td>
						<td data-label="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></td>
						<td data-label="관리">
							<div class="admin-row-acts">
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
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.admin-seller-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.admin-seller-intro {
		display: block;
		font-size: 11.5px;
	}
	.admin-row-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	tr.clickable {
		cursor: pointer;
	}
</style>
