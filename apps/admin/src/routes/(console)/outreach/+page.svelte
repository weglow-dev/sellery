<script lang="ts">
	/**
	 * 크리에이터 아웃리치 — 후보 큐. 상단: 상태 칩 · 검색 · [후보 추가] [CSV 가져오기] 접이식 폼. 표: 핸들 · 팔로워 · 참여율 · 추세 · 여성/20~40/KR · 적합 · 상태(즉시 변경) · 담당 · 수정일.
	 * 행 클릭 → 상세(지표 수정 · DM 초안 복사 · 메모 · 이력). DM 은 사람이 보낸다 — 자동 발송 없음.
	 * "Instagram 연결" 카드(0128): [Facebook 로그인으로 Instagram 연결] → 메타 로그인 창 → `meta/callback` → 연결된 계정 표시. [조건으로 수집] 은 그 연결로 조회한다.
	 * 문구는 `$lib/outreach-text`(한국어 · 영어) — 오른쪽 위 [English] / [한국어] 로 바꾼다(메타 앱 검수자용 · 표시만 바뀐다).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { outreachStatusChip, profileUrl, type OutreachStatus } from '@sellery/db/admin/outreach-rules';
	import { StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import { outreachText } from '$lib/outreach-text';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const t = $derived(outreachText(data.lang));
	const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
	const er = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000) / 10}%`);
	const meta = $derived(data.meta);
	const metaAccount = $derived(meta.connection ? `@${meta.connection.igUsername ?? meta.connection.igUserId}` : null);
	const statusLabel = (status: string, fallback: string) => t.statusLabel[status as OutreachStatus] ?? fallback;
	const fitTitle = (fit: { missing: string[]; unknown: string[] }) =>
		[...fit.missing.map((m) => `${t.list.fitMissing} ${t.fitLabel(m)}`), ...fit.unknown.map((u) => `${t.list.fitUnknown} ${t.fitLabel(u)}`)].join(' · ') || t.list.fitAll;
	function confirmDisconnect(e: SubmitEvent) {
		if (!confirm(t.meta.disconnectConfirm)) e.preventDefault();
	}
	function rowClick(href: string) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input,select')) return;
			goto(href);
		};
	}
</script>

<svelte:head>
	<title>{t.list.title}</title>
</svelte:head>

<div class="console-head">
	<h2>{t.list.heading}</h2>
	<span class="meta">{t.list.intro}</span>
	<a href={data.langToggle.query} class="btn ghost sm" style="margin-left:auto" lang={data.langToggle.to} hreflang={data.langToggle.to} data-sveltekit-reload>{data.langToggle.label}</a>
</div>

{#if data.msg}<p class="notice {data.msgTone}" role={data.msgTone === 'danger' ? 'alert' : 'status'}>{data.msg}</p>{/if}
{#if form?.error}<p class="notice danger" role="alert">{form.error}</p>{/if}

<section class="card static" style="margin:10px 0" aria-label={t.meta.card}>
	<div class="console-inline" style="gap:10px;flex-wrap:wrap;align-items:center">
		<h4 style="margin:0">{t.meta.card}</h4>
		{#if meta.connection && !meta.stale}
			<StatusChip tone="green">{t.meta.connected}</StatusChip>
			<span><b>{metaAccount}</b> · {t.meta.page} {meta.connection.pageName ?? meta.connection.pageId}</span>
			<span class="meta">{t.meta.connectedOn(meta.connection.connectedAt ? md(meta.connection.connectedAt) : null)}{meta.connection.connectedBy ? ` · ${meta.connection.connectedBy}` : ''}</span>
		{:else if meta.connection}
			<StatusChip tone="amber">{t.meta.stale}</StatusChip>
			<span><b>{metaAccount}</b> {t.meta.staleBody}</span>
		{:else if meta.source === 'env'}
			<StatusChip tone="blue">{t.meta.env}</StatusChip>
			<span class="meta">{t.meta.envBody}</span>
		{:else}
			<StatusChip tone="gray">{t.meta.none}</StatusChip>
		{/if}
		<form method="post" action="?/metaConnect" style="margin:0 0 0 auto">
			<button type="submit" class="pri sm" disabled={!meta.ready} title={meta.ready ? t.meta.connectTitle : t.meta.connectTitleOff}>{meta.connection ? t.meta.reconnect : t.meta.connect}</button>
		</form>
		{#if meta.connection}
			<form method="post" action="?/metaDisconnect" onsubmit={confirmDisconnect} style="margin:0"><button type="submit" class="sm danger ghost">{t.meta.disconnect}</button></form>
		{/if}
	</div>
	<p class="meta" style="margin:6px 0 0">{meta.ready ? t.meta.help : t.meta.helpOff}</p>
</section>

<nav class="cats console-filters" aria-label={t.list.filterAria}>
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {(data.status ?? '') === f.key ? 'on' : ''}" aria-current={(data.status ?? '') === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
</nav>

<div class="console-inline" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
	<form method="post" action="?/collect" style="margin:0" title={data.collect.configured ? t.collect.title(data.collect.provider) : t.collect.titleOff}>
		<input type="hidden" name="page" value={data.collect.nextPage} />
		<input type="hidden" name="after" value={data.collect.nextAfter} />
		<button type="submit" class="pri sm" disabled={!data.collect.configured}>{t.collect.button}{data.collect.configured && data.collect.nextPage ? t.collect.pageN(data.collect.nextPage + 1) : ''}</button>
		<small style="display:block;color:var(--color-mute);margin-top:4px">{data.collect.configured ? (data.collect.provider === 'meta' ? `${t.collect.subMeta}${meta.source === 'connection' && metaAccount ? ` · ${metaAccount}` : ''}` : t.collect.subModash) : t.collect.subOff}</small>
	</form>
	<form method="get" class="console-inline" style="margin:0">
		{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
		<input name="q" value={data.q} placeholder={t.list.searchPlaceholder} style="min-width:220px" />
		<button type="submit" class="sm ghost">{t.list.search}</button>
	</form>
	<details class="console-reject" style="min-width:280px">
		<summary class="btn sm">{t.list.addSummary}</summary>
		<form method="post" action="?/add" class="console-form console-reject-form" style="min-width:320px">
			<label class="lbl-sm" for="or-handles">{t.list.addLabel} <small>{t.list.addLabelSmall}</small></label>
			<textarea id="or-handles" name="handles" rows="3" placeholder="@jiyu_beauty&#10;https://instagram.com/somin_beauty"></textarea>
			<input name="category" placeholder={t.list.addCategory} />
			<button type="submit" class="pri sm">{t.list.add}</button>
		</form>
	</details>
	<details class="console-reject" style="min-width:280px">
		<summary class="btn sm">{t.list.csvSummary}</summary>
		<form method="post" action="?/import" class="console-form console-reject-form" style="min-width:360px">
			<label class="lbl-sm" for="or-csv">{t.list.csvLabel} <small>{t.list.csvLabelSmall}</small></label>
			<textarea id="or-csv" name="csv" rows="5" placeholder="핸들,팔로워,여성,20~40대,한국,추세,참여율,카테고리&#10;@jiyu_beauty,120k,72%,85,91,우상향,3.1%,이너뷰티"></textarea>
			<button type="submit" class="pri sm">{t.list.csvImport}</button>
		</form>
	</details>
</div>

<div class="tblw admin-table" style="margin-top:12px">
	<table>
		<thead>
			<tr><th>{t.list.th.creator}</th><th class="num">{t.list.th.followers}</th><th class="num">{t.list.th.er}</th><th>{t.list.th.trend}</th><th class="num">{t.list.th.female}</th><th class="num">{t.list.th.age}</th><th class="num">{t.list.th.kr}</th><th>{t.list.th.fit}</th><th>{t.list.th.status}</th><th>{t.list.th.owner}</th><th>{t.list.th.updated}</th></tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				{@const chip = outreachStatusChip(r.status)}
				<tr onclick={rowClick(r.href)} style="cursor:pointer">
					<td data-l={t.list.th.creator}>
						<a href={r.href}><b>@{r.handle}</b></a>{#if r.name}<small> {r.name}</small>{/if}
						<small style="display:block;color:var(--color-mute)">{t.category(r.category)} · <a href={profileUrl(r.handle, r.platform)} target="_blank" rel="noopener">{t.list.profile}</a></small>
					</td>
					<td class="num" data-l={t.list.th.followers}>{r.followers === null ? '—' : fmtNum(r.followers)}</td>
					<td class="num" data-l={t.list.th.er}>{er(r.engagement_rate)}</td>
					<td data-l={t.list.th.trend}>{r.trend ? t.trendLabel[r.trend] : '—'}</td>
					<td class="num" data-l={t.list.th.female}>{pct(r.audience?.female_pct)}</td>
					<td class="num" data-l={t.list.th.age}>{pct(r.audience?.age_20_40_pct)}</td>
					<td class="num" data-l={t.list.th.kr}>{pct(r.audience?.kr_pct)}</td>
					<td data-l={t.list.th.fit} title={fitTitle(r.fit)}>
						<b style={r.fit.ok ? 'color:var(--color-plat)' : r.fit.missing.length ? 'color:var(--color-danger)' : ''}>{r.fit.met}/{r.fit.total}</b>
						{#if r.fit.unknown.length}<small style="color:var(--color-mute)"> {t.list.fitUnknown} {r.fit.unknown.length}</small>{/if}
					</td>
					<td data-l={t.list.th.status}>
						<form method="post" action="?/status" style="display:inline-flex;gap:4px;align-items:center;margin:0">
							<input type="hidden" name="id" value={r.id} />
							<StatusChip tone={chip.tone}>{statusLabel(r.status, chip.label)}</StatusChip>
							<select name="status" aria-label={t.list.statusAria} onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} style="font-size:12px;padding:2px 4px">
								{#each data.statuses as s (s.value)}<option value={s.value} selected={s.value === r.status}>{s.label}</option>{/each}
							</select>
						</form>
					</td>
					<td data-l={t.list.th.owner}><small>{r.assigned_to ?? '—'}</small></td>
					<td data-l={t.list.th.updated}><small>{r.updated_at ? md(r.updated_at) : '—'}</small></td>
				</tr>
			{:else}
				<tr><td colspan="11" class="empty">{data.q || data.status ? t.list.emptyFiltered : t.list.empty}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="meta" style="margin:8px 3px 0">{t.list.footnote}</p>
