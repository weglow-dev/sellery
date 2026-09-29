<script lang="ts">
	/**
	 * 인플루언서 랭킹 — 프로토타입 `(demo)/rank/+page.svelte` 를 콘솔 화면으로.
	 *   상단: 내 등급 카드(상위 n% · 3개월 매출 · 다음 등급까지 진행 막대) + 등급별 혜택 표.
	 *   리더보드: 순위 · 인플루언서(본인만 실명 + MY 배지, 나머지 ○○○) · 카테고리 · 3개월 매출 ·
	 *     매출/팔로워 · 매출/좋아요 · 등급.
	 *
	 * 프로토타입의 `Pyramid` 컴포넌트(등급 피라미드 그림)는 가져오지 않았다 — 등급별 혜택 표가 같은 정보를
	 * 더 읽기 쉽게 담고, 좁은 화면(375px)에서 피라미드는 글자가 겹친다. 대신 현재 등급을 표에서 굵게 표시한다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { RANK_ANON_NOTE, anonLabel, nextGradeLine } from '@sellery/db/partner/rank-rules';
	import { GradeBox } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const r = $derived(data.ranking);
	const me = $derived(r?.me ?? null);
</script>

<svelte:head>
	<title>랭킹 — 셀러리</title>
</svelte:head>

<div class="console-head">
	<h2>인플루언서 랭킹</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">
	최근 3개월 <a href={data.salesPath} style="text-decoration:underline">확정 매출</a> 기준 · 등급 보너스는 플랫폼 수수료에서 지급돼요.
</p>

{#if data.failed}
	<p class="notice danger" role="status">랭킹을 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if me}
	<div class="mini-stats console-totals" style="margin-top:0">
		<div>
			<span class="ms-l">내 등급</span>
			<span class="ms-v"><GradeBox grade={me.grade} /></span>
			<span class="ms-s">{me.topPct !== null ? `상위 ${me.topPct}%` : ''}</span>
		</div>
		<div>
			<span class="ms-l">최근 3개월 매출</span>
			<span class="ms-v">₩{fmtNum(me.m3Sales)}</span>
			<span class="ms-s">{me.rank !== null ? `${me.total}명 중 ${me.rank}위` : ''}</span>
		</div>
		<div>
			<span class="ms-l">수수료 추가분</span>
			<span class="ms-v" style="color:var(--color-plat)">+{me.bonusPp ?? 0}%p</span>
			<span class="ms-s">기본 수수료율에 더해져요</span>
		</div>
	</div>

	<section class="card static" style="margin-top:14px">
		<div class="lbl-sm">다음 등급까지</div>
		{#if me.nextGrade}
			<div class="meter" style="margin-top:10px"><span style="width:{me.nextPct}%"></span></div>
		{/if}
		<p class="meta" style="margin-top:8px">{nextGradeLine(me, fmtNum)}</p>
	</section>

	<div class="sec" style="margin-top:20px">등급별 혜택</div>
	<div class="tblw">
		<table>
			<thead>
				<tr><th>등급</th><th class="num">기준 매출</th><th class="num">추가분</th><th>혜택</th></tr>
			</thead>
			<tbody>
				{#each r?.tiers ?? [] as t (t.name)}
					<tr class={t.isMine ? 'merow' : ''}>
						<td><GradeBox grade={t.name} sm />{#if t.isMine}<span class="mebadge">MY</span>{/if}</td>
						<td class="num">₩{fmtNum(t.minM3Sales)}+</td>
						<td class="num">+{t.bonusPp ?? 0}%p</td>
						<td style="white-space:normal">{t.perk ?? '-'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="sec" style="margin-top:20px">
		리더보드 <span class="console-sec-sub">— 매출 효율 랭킹</span>
	</div>
	<div class="tblw">
		<table>
			<thead>
				<tr>
					<th class="num">#</th><th>인플루언서</th><th>카테고리</th>
					<th class="num">3개월 매출</th><th class="num">매출/팔로워</th><th class="num">매출/좋아요</th><th>등급</th>
				</tr>
			</thead>
			<tbody>
				{#each r?.rows ?? [] as row (row.rank)}
					<tr class={row.isMe ? 'merow' : ''}>
						<td class="num">{row.rank}</td>
						<td>
							{#if row.isMe}
								<b>{anonLabel(row)}</b>
								{#if row.handle}<span class="sub">{row.handle}</span>{/if}
								<span class="mebadge">MY</span>
							{:else}
								{anonLabel(row)}
							{/if}
						</td>
						<td>{row.category ?? '-'}</td>
						<td class="num">₩{fmtNum(row.m3Sales)}</td>
						<td class="num">{row.perFollower !== null ? `₩${fmtNum(row.perFollower)}` : '-'}</td>
						<td class="num">{row.perLike !== null ? `₩${fmtNum(row.perLike)}` : '-'}</td>
						<td><GradeBox grade={row.grade} sm /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="meta" style="margin-top:10px">{RANK_ANON_NOTE}</p>
	<div class="btnrow" style="margin-top:14px">
		<a href={data.salesPath} class="btn sm ghost">실시간 매출</a>
		<a href={data.refPath} class="btn sm ghost">추천 프로그램</a>
	</div>
{/if}
