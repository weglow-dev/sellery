<script lang="ts">
	/** 아웃리치 후보 상세 — 왼쪽: 지표 폼 · DM 초안(복사·재생성). 오른쪽: 적합 판정 · 상태 버튼 · 메모 · 이력. 문구는 `$lib/outreach-text`(한국어 · 영어). */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { outreachStatusChip, profileUrl, type OutreachStatus } from '@sellery/db/admin/outreach-rules';
	import { CopyButton, StatusChip } from '@sellery/ui/site';
	import { outreachText } from '$lib/outreach-text';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const t = $derived(outreachText(data.lang));
	const d = $derived(t.detail);
	const r = $derived(data.row);
	const chip = $derived(outreachStatusChip(r.status));
	const confirmRemove = (e: SubmitEvent) => {
		if (!confirm(d.removeConfirm(r.handle))) e.preventDefault();
	};
</script>

<svelte:head>
	<title>@{r.handle} — {d.titleSuffix}</title>
</svelte:head>

<div class="console-head">
	<a href={data.listPath} class="btn ghost sm">{d.back}</a>
	<h2 style="margin:0">@{r.handle}{#if r.name}<small style="font-weight:400"> {r.name}</small>{/if}</h2>
	<StatusChip tone={chip.tone}>{t.statusLabel[r.status as OutreachStatus] ?? chip.label}</StatusChip>
	<a href={profileUrl(r.handle, r.platform)} target="_blank" rel="noopener" class="btn ghost sm" style="margin-left:auto">{d.openProfile}</a>
</div>

{#if data.msg}<p class="notice ok" role="status">{data.msg}</p>{/if}
{#if form?.error}<p class="notice danger" role="alert">{form.error}</p>{/if}

<div class="console-grid2">
	<section class="card static">
		<h4>{d.metrics} <span class="console-sec-sub">{d.metricsSub(r.source, r.last_checked_at ? md(r.last_checked_at) : null)}</span></h4>
		<form method="post" action="?/save" class="console-form">
			<div class="console-grid2" style="gap:8px">
				<div class="fld"><label for="o-name">{d.name}</label><input id="o-name" name="name" value={r.name ?? ''} /></div>
				<div class="fld"><label for="o-cat">{d.category}</label><input id="o-cat" name="category" value={r.category ?? ''} placeholder={d.categoryPh} /></div>
				<div class="fld"><label for="o-f">{d.followers}</label><input id="o-f" name="followers" inputmode="numeric" value={r.followers ?? ''} /></div>
				<div class="fld"><label for="o-er">{d.er}</label><input id="o-er" name="engagement_rate" inputmode="decimal" value={r.engagement_rate === null ? '' : Math.round(r.engagement_rate * 1000) / 10} placeholder="3.1" /></div>
				<div class="fld"><label for="o-tr">{d.trend}</label>
					<select id="o-tr" name="trend"><option value="">{d.unknown}</option>{#each data.trends as tr (tr)}<option value={tr} selected={r.trend === tr}>{t.trendLabel[tr]}</option>{/each}</select></div>
				<div class="fld"><label for="o-as">{d.owner}</label><input id="o-as" name="assigned_to" value={r.assigned_to ?? ''} placeholder={d.ownerPh} /></div>
			</div>
			<div class="lbl-sm" style="margin-top:10px">{d.audience} <small>{d.audienceSmall}</small></div>
			<div class="console-grid2" style="gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))">
				<div class="fld"><label for="o-fe">{d.female}</label><input id="o-fe" name="female_pct" inputmode="numeric" value={r.audience?.female_pct ?? ''} /></div>
				<div class="fld"><label for="o-ag">{d.age}</label><input id="o-ag" name="age_20_40_pct" inputmode="numeric" value={r.audience?.age_20_40_pct ?? ''} /></div>
				<div class="fld"><label for="o-kr">{d.kr}</label><input id="o-kr" name="kr_pct" inputmode="numeric" value={r.audience?.kr_pct ?? ''} /></div>
				<div class="fld"><label for="o-src">{d.source}</label><input id="o-src" name="audience_source" value={r.audience?.source ?? ''} placeholder={d.sourcePh} /></div>
			</div>
			<div class="fld" style="margin-top:10px"><label for="o-dm">{d.dm} <small>{d.dmSmall}</small></label>
				<textarea id="o-dm" name="dm_draft" rows="7">{r.dm_draft ?? ''}</textarea></div>
			<div class="btnrow">
				<button type="submit" class="pri sm">{d.save}</button>
				{#if r.dm_draft}<CopyButton text={r.dm_draft} label={d.copyDm} />{/if}
			</div>
		</form>
		<form method="post" action="?/draft" style="margin-top:8px"><button type="submit" class="sm ghost">{d.regen}</button></form>
	</section>

	<div>
		<section class="card static">
			<h4>{d.fit} <span class="console-sec-sub">{d.fitSub(data.fit.met, data.fit.total, data.fit.score)}</span></h4>
			{#if data.fit.ok}<p class="notice ok">{d.fitOk}</p>{/if}
			{#if data.fit.missing.length}<p class="meta console-danger">{d.missing}: {data.fit.missing.map(t.fitLabel).join(' · ')}</p>{/if}
			{#if data.fit.unknown.length}<p class="meta">{d.unverified}: {data.fit.unknown.map(t.fitLabel).join(' · ')}</p>{/if}
			<div class="meta">{d.followersLine(r.followers === null ? '—' : fmtNum(r.followers), r.trend ? t.trendLabel[r.trend] : '—')}</div>
		</section>

		<section class="card static" style="margin-top:12px">
			<h4>{d.status}</h4>
			<div class="btnrow" style="flex-wrap:wrap">
				{#each data.statuses as s (s.value)}
					<form method="post" action="?/status" style="margin:0">
						<input type="hidden" name="status" value={s.value} />
						<button type="submit" class="sm {s.value === r.status ? 'pri' : 'ghost'}" title={s.hint} disabled={s.value === r.status}>{s.label}</button>
					</form>
				{/each}
			</div>
			<p class="meta" style="margin-top:8px">{d.sentLine(r.sent_at ? md(r.sent_at) : '—', r.replied_at ? md(r.replied_at) : '—')}</p>
		</section>

		<section class="card static" style="margin-top:12px">
			<h4>{d.notes}</h4>
			<form method="post" action="?/note" class="console-form" style="margin-bottom:10px">
				<textarea name="body" rows="2" placeholder={d.notePh}></textarea>
				<button type="submit" class="sm">{d.noteAdd}</button>
			</form>
			<ul class="console-privacy">
				{#each data.events as e (e.id)}
					<li><small class="console-mono">{md(e.created_at)}</small> <b>{t.eventLabel[e.kind] ?? e.kind}</b>{#if e.body} — {e.body}{/if}{#if e.actor}<small style="color:var(--color-mute)"> · {e.actor}</small>{/if}</li>
				{:else}
					<li class="meta">{d.noEvents}</li>
				{/each}
			</ul>
		</section>

		<form method="post" action="?/remove" onsubmit={confirmRemove} style="margin-top:12px"><button type="submit" class="sm danger ghost">{d.remove}</button></form>
	</div>
</div>
