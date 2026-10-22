<script lang="ts">
	/** 아웃리치 후보 상세 — 왼쪽: 지표 폼 · DM 초안(복사·재생성). 오른쪽: 적합 판정 · 상태 버튼 · 메모 · 이력. */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { OUTREACH_EVENT_LABEL, OUTREACH_TREND_LABEL, outreachStatusChip, profileUrl } from '@sellery/db/admin/outreach-rules';
	import { CopyButton, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const r = $derived(data.row);
	const chip = $derived(outreachStatusChip(r.status));
	const confirmRemove = (e: SubmitEvent) => {
		if (!confirm(`@${r.handle} 후보를 삭제할까요? 이력도 함께 지워집니다.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>@{r.handle} — 아웃리치 · 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<a href={data.listPath} class="btn ghost sm">← 목록</a>
	<h2 style="margin:0">@{r.handle}{#if r.name}<small style="font-weight:400"> {r.name}</small>{/if}</h2>
	<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
	<a href={profileUrl(r.handle, r.platform)} target="_blank" rel="noopener" class="btn ghost sm" style="margin-left:auto">프로필 열기 ↗</a>
</div>

{#if data.msg}<p class="notice ok" role="status">{data.msg}</p>{/if}
{#if form?.error}<p class="notice danger" role="alert">{form.error}</p>{/if}

<div class="console-grid2">
	<section class="card static">
		<h4>지표 <span class="console-sec-sub">— 수집 {r.source} · 갱신 {r.last_checked_at ? md(r.last_checked_at) : '—'}</span></h4>
		<form method="post" action="?/save" class="console-form">
			<div class="console-grid2" style="gap:8px">
				<div class="fld"><label for="o-name">이름/활동명</label><input id="o-name" name="name" value={r.name ?? ''} /></div>
				<div class="fld"><label for="o-cat">카테고리</label><input id="o-cat" name="category" value={r.category ?? ''} placeholder="다이어트 · 이너뷰티 · 건강" /></div>
				<div class="fld"><label for="o-f">팔로워</label><input id="o-f" name="followers" inputmode="numeric" value={r.followers ?? ''} /></div>
				<div class="fld"><label for="o-er">참여율 (%)</label><input id="o-er" name="engagement_rate" inputmode="decimal" value={r.engagement_rate === null ? '' : Math.round(r.engagement_rate * 1000) / 10} placeholder="3.1" /></div>
				<div class="fld"><label for="o-tr">1년 반응 추세</label>
					<select id="o-tr" name="trend"><option value="">미확인</option>{#each data.trends as t (t)}<option value={t} selected={r.trend === t}>{OUTREACH_TREND_LABEL[t]}</option>{/each}</select></div>
				<div class="fld"><label for="o-as">담당자</label><input id="o-as" name="assigned_to" value={r.assigned_to ?? ''} placeholder="운영자 이메일" /></div>
			</div>
			<div class="lbl-sm" style="margin-top:10px">팔로워 구성 <small>(분석사 추정 또는 운영자 판단 · %)</small></div>
			<div class="console-grid2" style="gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))">
				<div class="fld"><label for="o-fe">여성</label><input id="o-fe" name="female_pct" inputmode="numeric" value={r.audience?.female_pct ?? ''} /></div>
				<div class="fld"><label for="o-ag">20~40대</label><input id="o-ag" name="age_20_40_pct" inputmode="numeric" value={r.audience?.age_20_40_pct ?? ''} /></div>
				<div class="fld"><label for="o-kr">한국</label><input id="o-kr" name="kr_pct" inputmode="numeric" value={r.audience?.kr_pct ?? ''} /></div>
				<div class="fld"><label for="o-src">출처</label><input id="o-src" name="audience_source" value={r.audience?.source ?? ''} placeholder="Modash · 수동" /></div>
			</div>
			<div class="fld" style="margin-top:10px"><label for="o-dm">DM 초안 <small>(복사해서 @sellery.official 에서 직접 보내요)</small></label>
				<textarea id="o-dm" name="dm_draft" rows="7">{r.dm_draft ?? ''}</textarea></div>
			<div class="btnrow">
				<button type="submit" class="pri sm">저장</button>
				{#if r.dm_draft}<CopyButton text={r.dm_draft} label="DM 초안 복사" />{/if}
			</div>
		</form>
		<form method="post" action="?/draft" style="margin-top:8px"><button type="submit" class="sm ghost">초안 다시 만들기 (이름·카테고리 반영)</button></form>
	</section>

	<div>
		<section class="card static">
			<h4>적합 판정 <span class="console-sec-sub">— {data.fit.met}/{data.fit.total} · 점수 {data.fit.score}</span></h4>
			{#if data.fit.ok}<p class="notice ok">조건 전부 충족</p>{/if}
			{#if data.fit.missing.length}<p class="meta console-danger">미달: {data.fit.missing.join(' · ')}</p>{/if}
			{#if data.fit.unknown.length}<p class="meta">미확인: {data.fit.unknown.join(' · ')}</p>{/if}
			<div class="meta">팔로워 {r.followers === null ? '—' : fmtNum(r.followers)} · 추세 {r.trend ? OUTREACH_TREND_LABEL[r.trend] : '—'}</div>
		</section>

		<section class="card static" style="margin-top:12px">
			<h4>상태</h4>
			<div class="btnrow" style="flex-wrap:wrap">
				{#each data.statuses as s (s.value)}
					<form method="post" action="?/status" style="margin:0">
						<input type="hidden" name="status" value={s.value} />
						<button type="submit" class="sm {s.value === r.status ? 'pri' : 'ghost'}" title={s.hint} disabled={s.value === r.status}>{s.label}</button>
					</form>
				{/each}
			</div>
			<p class="meta" style="margin-top:8px">DM 보냄 {r.sent_at ? md(r.sent_at) : '—'} · 답장 {r.replied_at ? md(r.replied_at) : '—'}</p>
		</section>

		<section class="card static" style="margin-top:12px">
			<h4>메모 · 이력</h4>
			<form method="post" action="?/note" class="console-form" style="margin-bottom:10px">
				<textarea name="body" rows="2" placeholder="통화 내용 · 다음 액션 · 특이사항"></textarea>
				<button type="submit" class="sm">메모 남기기</button>
			</form>
			<ul class="console-privacy">
				{#each data.events as e (e.id)}
					<li><small class="console-mono">{md(e.created_at)}</small> <b>{OUTREACH_EVENT_LABEL[e.kind] ?? e.kind}</b>{#if e.body} — {e.body}{/if}{#if e.actor}<small style="color:var(--color-mute)"> · {e.actor}</small>{/if}</li>
				{:else}
					<li class="meta">이력이 없어요</li>
				{/each}
			</ul>
		</section>

		<form method="post" action="?/remove" onsubmit={confirmRemove} style="margin-top:12px"><button type="submit" class="sm danger ghost">후보 삭제</button></form>
	</div>
</div>
