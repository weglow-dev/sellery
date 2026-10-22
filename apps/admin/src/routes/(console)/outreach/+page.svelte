<script lang="ts">
	/**
	 * 크리에이터 아웃리치 — 후보 큐. 상단: 상태 칩 · 검색 · [후보 추가] [CSV 가져오기] 접이식 폼. 표: 핸들 · 팔로워 · 참여율 · 추세 · 여성/20~40/KR · 적합 · 상태(즉시 변경) · 담당 · 수정일.
	 * 행 클릭 → 상세(지표 수정 · DM 초안 복사 · 메모 · 이력). DM 은 사람이 보낸다 — 자동 발송 없음.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { OUTREACH_FILTER, OUTREACH_TREND_LABEL, outreachStatusChip, profileUrl } from '@sellery/db/admin/outreach-rules';
	import { StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
	const er = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000) / 10}%`);
	function rowClick(href: string) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input,select')) return;
			goto(href);
		};
	}
</script>

<svelte:head>
	<title>아웃리치 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>크리에이터 아웃리치</h2>
	<span class="meta">MYR 제조의뢰 제안 후보 — 기준: 팔로워 {OUTREACH_FILTER.minFollowers / 10000}만↑ · 여성 {OUTREACH_FILTER.femalePct}%↑ · 20~40대 {OUTREACH_FILTER.age2040Pct}%↑ · 한국 {OUTREACH_FILTER.krPct}%↑ · 반응 우상향/유지. DM 은 초안을 복사해 @sellery.official 에서 직접 보내요.</span>
</div>

{#if data.msg}<p class="notice ok" role="status">{data.msg}</p>{/if}
{#if form?.error}<p class="notice danger" role="alert">{form.error}</p>{/if}

<nav class="cats console-filters" aria-label="상태 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {(data.status ?? '') === f.key ? 'on' : ''}" aria-current={(data.status ?? '') === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
</nav>

<div class="console-inline" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
	<form method="post" action="?/collect" style="margin:0" title={data.collect.configured ? `${data.collect.provider} 검색 — 조건(팔로워·여성·20~40대·한국·성장률)으로 걸러진 결과 1페이지(≤15건)를 가져와요. 누를 때마다 다음 페이지` : 'Vercel sellery-admin 에 MODASH_API_KEY 를 넣으면 켜져요'}>
		<input type="hidden" name="page" value={data.collect.nextPage} />
		<button type="submit" class="pri sm" disabled={!data.collect.configured}>⚡ 조건으로 수집{data.collect.configured && data.collect.nextPage ? ` (${data.collect.nextPage + 1}페이지)` : ''}</button>
		{#if !data.collect.configured}<small style="display:block;color:var(--color-mute);margin-top:4px">수집 제공사 API 키 필요</small>{/if}
	</form>
	<form method="get" class="console-inline" style="margin:0">
		{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
		<input name="q" value={data.q} placeholder="핸들 · 이름 · 카테고리 검색" style="min-width:220px" />
		<button type="submit" class="sm ghost">검색</button>
	</form>
	<details class="console-reject" style="min-width:280px">
		<summary class="btn sm">+ 후보 추가</summary>
		<form method="post" action="?/add" class="console-form console-reject-form" style="min-width:320px">
			<label class="lbl-sm" for="or-handles">인스타 핸들 <small>(줄·쉼표로 여러 개 · @ · URL 가능)</small></label>
			<textarea id="or-handles" name="handles" rows="3" placeholder="@jiyu_beauty&#10;https://instagram.com/somin_beauty"></textarea>
			<input name="category" placeholder="카테고리 (선택 · 예: 다이어트)" />
			<button type="submit" class="pri sm">추가</button>
		</form>
	</details>
	<details class="console-reject" style="min-width:280px">
		<summary class="btn sm">CSV 가져오기</summary>
		<form method="post" action="?/import" class="console-form console-reject-form" style="min-width:360px">
			<label class="lbl-sm" for="or-csv">헤더 포함 CSV/TSV <small>(핸들 · 팔로워 · 여성 · 20~40대 · 한국 · 추세 · 참여율 · 카테고리 · 이름 — 순서 자유, 없는 열은 생략)</small></label>
			<textarea id="or-csv" name="csv" rows="5" placeholder="핸들,팔로워,여성,20~40대,한국,추세,참여율,카테고리&#10;@jiyu_beauty,120k,72%,85,91,우상향,3.1%,이너뷰티"></textarea>
			<button type="submit" class="pri sm">가져오기</button>
		</form>
	</details>
</div>

<div class="tblw admin-table" style="margin-top:12px">
	<table>
		<thead>
			<tr><th>크리에이터</th><th class="num">팔로워</th><th class="num">참여율</th><th>추세</th><th class="num">여성</th><th class="num">20~40</th><th class="num">한국</th><th>적합</th><th>상태</th><th>담당</th><th>수정</th></tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				{@const chip = outreachStatusChip(r.status)}
				<tr onclick={rowClick(r.href)} style="cursor:pointer">
					<td data-l="크리에이터">
						<a href={r.href}><b>@{r.handle}</b></a>{#if r.name}<small> {r.name}</small>{/if}
						<small style="display:block;color:var(--color-mute)">{r.category ?? '—'} · <a href={profileUrl(r.handle, r.platform)} target="_blank" rel="noopener">프로필 ↗</a></small>
					</td>
					<td class="num" data-l="팔로워">{r.followers === null ? '—' : fmtNum(r.followers)}</td>
					<td class="num" data-l="참여율">{er(r.engagement_rate)}</td>
					<td data-l="추세">{r.trend ? OUTREACH_TREND_LABEL[r.trend] : '—'}</td>
					<td class="num" data-l="여성">{pct(r.audience?.female_pct)}</td>
					<td class="num" data-l="20~40">{pct(r.audience?.age_20_40_pct)}</td>
					<td class="num" data-l="한국">{pct(r.audience?.kr_pct)}</td>
					<td data-l="적합" title={[...r.fit.missing.map((m) => `미달 ${m}`), ...r.fit.unknown.map((u) => `미확인 ${u}`)].join(' · ') || '전부 충족'}>
						<b style={r.fit.ok ? 'color:var(--color-plat)' : r.fit.missing.length ? 'color:var(--color-danger)' : ''}>{r.fit.met}/{r.fit.total}</b>
						{#if r.fit.unknown.length}<small style="color:var(--color-mute)"> 미확인 {r.fit.unknown.length}</small>{/if}
					</td>
					<td data-l="상태">
						<form method="post" action="?/status" style="display:inline-flex;gap:4px;align-items:center;margin:0">
							<input type="hidden" name="id" value={r.id} />
							<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
							<select name="status" aria-label="상태 변경" onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()} style="font-size:12px;padding:2px 4px">
								{#each data.statuses as s (s.value)}<option value={s.value} selected={s.value === r.status}>{s.label}</option>{/each}
							</select>
						</form>
					</td>
					<td data-l="담당"><small>{r.assigned_to ?? '—'}</small></td>
					<td data-l="수정"><small>{r.updated_at ? md(r.updated_at) : '—'}</small></td>
				</tr>
			{:else}
				<tr><td colspan="11" class="empty">{data.q || data.status ? '조건에 맞는 후보가 없어요' : '아직 후보가 없어요 — [+ 후보 추가] 또는 [CSV 가져오기]로 시작하세요'}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="meta" style="margin:8px 3px 0">[조건으로 수집]은 인플루언서 데이터 제공사(Modash) 검색에 대표 조건을 그대로 보내 걸러진 계정만 받아옵니다(페이지당 ≤15건 · 크레딧 차감) · 여성·연령·국가 비율은 공식 API 로 남의 계정을 조회할 수 없어 제공사 추정값이나 CSV · 운영자 판단으로 채웁니다 · 자동 DM 발송은 메타 약관·정보통신망법 위반이라 하지 않습니다 — 답장이 온 뒤의 자동 응답만 2단계에서 붙입니다.</p>
