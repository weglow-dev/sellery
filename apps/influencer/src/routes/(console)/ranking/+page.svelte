<script lang="ts">
	/**
	 * 인플루언서 랭킹 — 프로토타입 `(demo)/rank/+page.svelte` 를 콘솔 화면으로. 데모와 같은 구성:
	 *   2열 카드: 내 등급(상위 n% · 3개월 매출 · 등급 피라미드 · 다음 등급까지 진행 막대) | 등급별 혜택 목록.
	 *   리더보드: 순위 · 인플루언서(본인만 실명 + MY 배지, 나머지 ○○○) · 카테고리 · 3개월 매출 ·
	 *     매출/팔로워 · 매출/좋아요 · 등급.
	 *
	 * 피라미드는 브랜드 내 정보와 같은 `.console-pyr` 마크업이다 — 행 폭이 %라 375px 에서도 글자가 겹치지 않는다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { RANK_ANON_NOTE, anonLabel, nextGradeLine } from '@sellery/db/partner/rank-rules';
	import { GradeBox, GradeIcon } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const r = $derived(data.ranking);
	const me = $derived(r?.me ?? null);
	/** 위(최고 등급)에서 아래(스타터)로 — 피라미드와 혜택 목록이 같은 순서 */
	const tiers = $derived([...(r?.tiers ?? [])].sort((a, b) => b.minM3Sales - a.minM3Sales));
	const MEDAL = ['🥇', '🥈', '🥉'];
</script>

<svelte:head>
	<title>랭킹 — 셀러리</title>
</svelte:head>

<div class="console-head">
	<h2>인플루언서 랭킹</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta rank-lead">
	최근 3개월 <a href={data.salesPath}>확정 매출</a> 기준 · <b>매월 1일</b> 다시 계산돼요 — 판매가 없으면 등급이 내려갈 수 있어요.
	등급 보너스는 플랫폼 수수료에서 지급되고, 정산은 실행 시점 등급을 따라요.
</p>

{#if data.failed}
	<p class="notice danger" role="status">랭킹을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if me}
	<div class="console-grid2 rank-top">
		<!-- 내 등급 -->
		<section class="card static">
			<div class="lbl-sm">내 등급{#if me.topPct !== null} — 상위 {me.topPct}%{/if}</div>
			<div class="rank-me-head">
				<GradeBox grade={me.grade} />
				<span class="amt">₩{fmtNum(me.m3Sales)}</span>
				<span class="meta">최근 3개월</span>
			</div>
			<div class="rank-me-stats">
				<div>
					<span class="k">전체 순위</span>
					<span class="v">{me.rank !== null ? `${fmtNum(me.rank)}위` : '—'}<small> / {fmtNum(me.total)}명</small></span>
				</div>
				<div>
					<span class="k">수수료 추가분</span>
					<span class="v plat">+{me.bonusPp ?? 0}%p</span>
				</div>
			</div>

			{#if tiers.length}
				<div class="console-pyr" role="list" aria-label="인플루언서 등급 피라미드">
					{#each tiers as t, i (t.name)}
						<div class="console-pyr-row" class:me={t.isMine} role="listitem" style="width:calc(128px + {(i * 11).toFixed(1)}%)">
							<span><GradeIcon grade={t.name} /> {t.name}{#if t.isMine} <span class="mebadge">MY</span>{/if}</span>
							{#if t.topPct !== null}<span class="pct">상위 {t.topPct}%</span>{/if}
						</div>
					{/each}
				</div>
			{/if}

			{#if me.nextGrade}
				<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={me.nextPct} aria-label="다음 등급까지 진행률">
					<span style="width:{me.nextPct}%"></span>
				</div>
			{/if}
			<p class="rank-next">{nextGradeLine(me, fmtNum)}</p>
		</section>

		<!-- 등급별 혜택 -->
		<section class="card static">
			<div class="lbl-sm">등급별 혜택</div>
			<div class="rank-tiers">
				{#each tiers as t (t.name)}
					<div class="row" class:me={t.isMine}>
						<span class="g"><GradeBox grade={t.name} sm />{#if t.isMine}<span class="mebadge">MY</span>{/if}</span>
						<span class="min">₩{fmtNum(t.minM3Sales)}+</span>
						<span class="pp">+{t.bonusPp ?? 0}%p</span>
						<span class="perk">{t.perk ?? '-'}</span>
					</div>
				{/each}
			</div>
			<p class="rank-foot">추가분은 브랜드가 제안한 수수료율에 더해져요 — 예: 제안 20% · 추가분 +1%p → 21%.</p>
		</section>
	</div>

	<div class="sec">
		리더보드 <span class="console-sec-sub">— 매출 효율 랭킹</span>
		{#if r?.rows.length}<span class="badge">{fmtNum(r.rows.length)}</span>{/if}
	</div>
	<div class="tblw rank-board">
		<table>
			<thead>
				<tr>
					<th class="num">#</th><th>인플루언서</th><th>카테고리</th>
					<th class="num">3개월 매출</th><th class="num">매출/팔로워</th><th class="num">매출/좋아요</th><th>등급</th>
				</tr>
			</thead>
			<tbody>
				{#each r?.rows ?? [] as row (row.rank)}
					<tr class:merow={row.isMe}>
						<td class="num rk">
							{#if row.rank <= 3}<span class="medal" aria-hidden="true">{MEDAL[row.rank - 1]}</span>{/if}{row.rank}
						</td>
						<td>
							{#if row.isMe}
								<b>{anonLabel(row)}</b>
								{#if row.handle}<span class="hd">{row.handle}</span>{/if}
								<span class="mebadge">MY</span>
							{:else}
								<span class="anon">{anonLabel(row)}</span>
							{/if}
						</td>
						<td>{row.category ?? '-'}</td>
						<td class="num">₩{fmtNum(row.m3Sales)}</td>
						<td class="num">{row.perFollower !== null ? `₩${fmtNum(row.perFollower)}` : '-'}</td>
						<td class="num">{row.perLike !== null ? `₩${fmtNum(row.perLike)}` : '-'}</td>
						<td><GradeBox grade={row.grade} sm /></td>
					</tr>
				{:else}
					<tr><td colspan="7" class="empty">아직 순위가 없어요</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="rank-foot rank-note">{RANK_ANON_NOTE}</p>

	<div class="btnrow rank-links">
		<a href={data.salesPath} class="btn sm ghost">실시간 매출</a>
		<a href={data.refPath} class="btn sm ghost">추천 프로그램</a>
	</div>
{/if}

<style>
	.rank-lead {
		margin: -8px 3px 14px;
	}
	.rank-lead a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.rank-top {
		gap: 0 14px;
		align-items: start;
	}
	.rank-top > .card {
		margin-bottom: 12px;
	}

	/* 내 등급 머리 — 데모: 등급 박스 · 큰 매출 · "최근 3개월" */
	.rank-me-head {
		display: flex;
		align-items: center;
		gap: 8px 12px;
		flex-wrap: wrap;
		margin: 10px 0 12px;
	}
	.rank-me-head .amt {
		font-family: var(--font-display);
		font-size: 25px;
		font-weight: 800;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
	}
	.rank-me-head .meta {
		margin: 0;
	}
	.rank-me-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 0 3px 4px;
	}
	.rank-me-stats > div {
		background: var(--color-surface-2);
		box-shadow: var(--shadow-frame-soft);
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rank-me-stats .k {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--color-mute);
	}
	.rank-me-stats .v {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.rank-me-stats .v small {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 400;
		color: var(--color-mute);
	}
	.plat {
		color: var(--color-plat);
	}
	.rank-next {
		font-size: 12px;
		color: var(--color-mute);
		margin: 7px 3px 0;
		line-height: 1.6;
		word-break: keep-all;
	}

	/* 등급별 혜택 — 데모: 등급 박스 · 기준 매출 · 혜택 한 줄씩, 내 등급은 굵게 */
	.rank-tiers {
		display: flex;
		flex-direction: column;
		margin-top: 10px;
	}
	.rank-tiers .row {
		display: grid;
		grid-template-columns: 104px 104px 54px minmax(0, 1fr);
		gap: 4px 10px;
		align-items: center;
		font-size: 12.5px;
		padding: 8px 6px;
		border-bottom: 1px dashed var(--color-line-soft);
	}
	.rank-tiers .row:last-child {
		border-bottom: none;
	}
	.rank-tiers .row.me {
		background: var(--color-lime-soft);
		font-weight: 700;
		box-shadow: var(--shadow-frame-soft);
	}
	.rank-tiers .g {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}
	.rank-tiers .min,
	.rank-tiers .pp {
		font-family: var(--font-mono);
		font-size: 11px;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.rank-tiers .min {
		color: var(--color-mute);
	}
	.rank-tiers .pp {
		color: var(--color-plat);
		font-weight: 700;
	}
	.rank-tiers .perk {
		color: var(--color-mute);
		word-break: keep-all;
	}
	.rank-tiers .row.me .perk {
		color: var(--color-ink);
	}
	.rank-foot {
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.6;
		margin: 10px 0 0;
		word-break: keep-all;
	}

	.mebadge {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 700;
		background: var(--color-ink);
		color: var(--color-lime);
		padding: 1px 5px;
		margin-left: 5px;
		letter-spacing: 0.08em;
		vertical-align: 1px;
	}

	/* 리더보드 */
	.rank-board table {
		min-width: 680px;
	}
	.rank-board .rk {
		font-weight: 700;
		width: 56px;
	}
	.rank-board .medal {
		margin-right: 4px;
		font-size: 13px;
	}
	.rank-board .hd {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--color-mute);
		margin-left: 5px;
	}
	.rank-board .anon {
		color: var(--color-mute);
	}
	.rank-board tr.merow td {
		box-shadow: inset 0 2px 0 var(--color-accent), inset 0 -2px 0 var(--color-accent);
	}
	.rank-note {
		margin: 8px 3px 0;
	}
	.rank-links {
		margin-top: 14px;
	}

	@media (max-width: 560px) {
		.rank-tiers .row {
			grid-template-columns: 104px 1fr 54px;
		}
		.rank-tiers .perk {
			grid-column: 1 / -1;
		}
	}
</style>
