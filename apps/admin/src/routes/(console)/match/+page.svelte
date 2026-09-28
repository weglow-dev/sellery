<script lang="ts">
	/**
	 * 매칭 · 자동 제안 — 데모 `(demo)/match`와 같은 구성:
	 *   1 요즘 뜨는 인플루언서  2 브랜드 자동 제안 ON/OFF  3 자동 제안 후보 + 실행  4 자동 제안 이력
	 *
	 * 데모와 다른 점(실서비스 게이트가 더 많다 — `app_brand_invite_candidates`(0016) 와 같은 조건):
	 *   · 비공개 인플루언서는 후보에서 **빠진다**(데모는 점수만 −5). 익명 스카우트는 6단계다.
	 *   · 우선권 등급(플래티넘 · 다이아 · 블랙)도 빠진다 — 🥬 제안권이 6단계.
	 *     데모 안내문 "다이아·블랙 대상은 브랜드 🥬 10 자동 차감" 이 그 게이트다.
	 *   · 메인 채널 인증이 필요하다.
	 * 뜨는 인플루언서 목록에는 **전원**이 나오고 적격이 아니면 사유를 적는다 — 왜 후보에 없는지 보이게.
	 */
	import { enhance } from '$app/forms';
	import { fmtNum } from '@sellery/db/campaign';
	import { campaignStatusChip } from '@sellery/db/admin/campaign-rules';
	import { GradeBox, PlatformHandle, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const v = $derived(data.view);
	const won = (n: number) => `₩${fmtNum(Math.round(n))}`;
	const growth = (n: number) => `${n >= 0 ? '▲' : '▼'}${Math.abs(n).toFixed(1)}%`;
	const md = (iso: string | null) => {
		if (!iso) return '—';
		const [, m, d] = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).split('-');
		return `${Number(m)}/${Number(d)}`;
	};
	/** 성장세 막대 — 1위 대비 비율 */
	const barWidth = (n: number, top: number) => `${Math.max(6, Math.min(100, top > 0 ? (n / top) * 100 : 6))}%`;
	const topGrowth = $derived(v?.rising[0]?.growth ?? 0);
	const sendCount = $derived(v ? Math.min(data.batch, v.candidates.length) : 0);
	const autoOn = $derived(v ? v.brands.filter((b) => b.autoPropose).length : 0);
	const excludedTotal = $derived(
		v ? v.excluded.hidden + v.excluded.priority + v.excluded.unverified + v.excluded.suspended : 0
	);
</script>

<svelte:head>
	<title>매칭·자동 제안 — 셀러리 관리자</title>
</svelte:head>

<h2 class="pg">
	매칭·자동 제안
	<small>요즘 뜨는 인플루언서를 브랜드 상품과 자동 매칭 · 브랜드별 자동 제안 ON/OFF</small>
</h2>

{#if form?.toggleError}<p class="notice danger" role="alert">{form.toggleError}</p>{/if}
{#if form?.runError}<p class="notice danger" role="alert">{form.runError}</p>{/if}

{#if form?.rows}
	<section class="card static match-result-card" aria-live="polite">
		<h4 class="admin-h4">자동 제안 실행 결과 <span class="meta">{form.summary}</span></h4>
		<ul class="match-result">
			{#each form.rows as r (r.productCode + r.sellerHandle)}
				<li class:bad={!r.ok}>
					<span class="st {r.ok ? 'green' : 'red'}">{r.ok ? '발송' : '실패'}</span>
					<span class="grow">
						<b>{r.productName}</b> → {r.sellerName} <span class="console-mono meta">{r.sellerHandle}</span>
					</span>
					{#if r.ok}
						{#if r.campaignCode}
							<a class="console-mono" href="{data.paths.campaigns}/{encodeURIComponent(r.campaignCode)}">{r.campaignCode.toUpperCase()}</a>
						{/if}
					{:else}
						<span class="down">{r.reason}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if !v}
	<p class="notice danger" role="status">매칭 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
{:else}
	<div class="mini-stats admin-strip">
		<div><div class="ms-l">자동 제안 ON 브랜드</div><div class="ms-v">{fmtNum(autoOn)}<span class="ms-s"> / {fmtNum(v.brands.length)}</span></div></div>
		<div><div class="ms-l">오늘 후보</div><div class="ms-v">{fmtNum(v.candidates.length)}</div></div>
		<div><div class="ms-l">이번 실행 발송</div><div class="ms-v">{fmtNum(sendCount)}</div></div>
		<div><div class="ms-l">누적 자동 제안</div><div class="ms-v">{fmtNum(v.history.length)}</div></div>
	</div>

	<div class="grid g2 match-2col">
		<!-- 1. 요즘 뜨는 인플루언서 -->
		<section class="card static">
			<div class="lbl-sm match-lbl">📈 요즘 뜨는 인플루언서</div>
			<p class="match-desc">최근 게시물 반응 성장률 (후반 평균 vs 전반 평균) · 관리자는 비공개 인플루언서도 실명 표시</p>
			{#if v.rising.length === 0}
				<p class="empty">아직 인플루언서가 없습니다</p>
			{:else}
				<ol class="match-rising">
					{#each v.rising as s, i (s.id)}
						<li class="hb-row">
							<span class="match-nm">
								<span class="rk">{i + 1}.</span>
								{#if s.code}
									<a href="{data.paths.sellers}/{encodeURIComponent(s.code)}">{s.name}</a>
								{:else}
									<b>{s.name}</b>
								{/if}
								<PlatformHandle platform={s.platform} handle={s.handle} class="match-handle" />
								<GradeBox grade={s.grade} sm />
								{#if !s.eligible && s.reason}<span class="st gray">{s.reason}</span>{/if}
							</span>
							<div class="hb-track"><div class="hb-bar" class:top={i === 0} style="width:{barWidth(s.growth, topGrowth)}"></div></div>
							<span class="hb-val" class:up={s.growth >= 0} class:down={s.growth < 0}>{growth(s.growth)}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- 2. 브랜드 자동 제안 ON/OFF -->
		<section class="card static match-brands-card">
			<div class="lbl-sm match-lbl">🤖 브랜드 자동 제안 설정</div>
			{#if v.brands.length === 0}
				<p class="empty">아직 브랜드가 없습니다</p>
			{:else}
				<div class="match-brands">
					{#each v.brands as b (b.id)}
						<div class="rowitem">
							<div class="grow">
								<div class="nm">
									{#if b.code}
										<a href="{data.paths.brands}/{encodeURIComponent(b.code)}">{b.name}</a>
									{:else}
										{b.name}
									{/if}
									<GradeBox grade={b.grade} sm />
								</div>
								<div class="sub">노출 상품 {fmtNum(b.listedProducts)}개 · 보유 🥬 {fmtNum(b.celery)}</div>
							</div>
							<form method="POST" action="?/toggle" use:enhance class="rowacts">
								<input type="hidden" name="brand" value={b.code ?? b.id} />
								<input type="hidden" name="on" value={b.autoPropose ? '0' : '1'} />
								<button type="submit" class="sm {b.autoPropose ? 'pri' : 'ghost'}" aria-pressed={b.autoPropose}>
									{b.autoPropose ? '자동 제안 ON' : '자동 제안 OFF'}
								</button>
							</form>
						</div>
					{/each}
				</div>
			{/if}
			<p class="match-foot">
				ON 이면 카테고리 적합도 × 성장세 × 매출/팔로워 점수로 상위 인플루언서에게 브랜드 명의로 제안합니다.
				비공개 계정과 우선권 등급(플래티넘 이상)은 제안 대상이 아닙니다 — 갤러리 열람·🥬 제안권이 6단계입니다.
			</p>
		</section>
	</div>

	<!-- 3. 후보 + 실행 -->
	<div class="sec">
		자동 제안 후보
		<span class="badge">{fmtNum(v.candidates.length)}</span>
	</div>

	<div class="card static match-cand">
		<div class="match-cand-head">
			<div class="match-cand-desc">
				상품별 상위 2명 · 진행 중 캠페인·독점 확정 상품 제외 · 실행 시 점수 상위 {fmtNum(data.batch)}건 발송
				{#if excludedTotal}
					<span class="match-excl">
						제외
						{#if v.excluded.hidden}<span class="st gray">비공개 {v.excluded.hidden}</span>{/if}
						{#if v.excluded.priority}<span class="st gray">우선권 등급 {v.excluded.priority}</span>{/if}
						{#if v.excluded.unverified}<span class="st gray">채널 미인증 {v.excluded.unverified}</span>{/if}
						{#if v.excluded.suspended}<span class="st gray">정지 {v.excluded.suspended}</span>{/if}
					</span>
				{/if}
			</div>
			<form method="POST" action="?/run" use:enhance>
				<button type="submit" class="pri sm" disabled={sendCount === 0}>오늘 자동 제안 실행 ({fmtNum(sendCount)}건)</button>
			</form>
		</div>

		<div class="tblw admin-table match-tbl">
			<table>
				<thead>
					<tr>
						<th>브랜드 · 상품</th>
						<th>인플루언서</th>
						<th class="num">성장세</th>
						<th class="num">3개월 매출</th>
						<th class="num">매칭 점수</th>
					</tr>
				</thead>
				<tbody>
					{#each v.candidates as c, i (c.product.id + c.seller.id)}
						<tr class:willsend={i < data.batch}>
							<td data-l="브랜드 · 상품">
								{#if i < data.batch}<span class="match-send" title="이번 실행에 발송">발송</span>{/if}
								{#if c.product.code}
									<a href="{data.paths.products}/{encodeURIComponent(c.product.code)}"><b>{c.product.name}</b></a>
								{:else}
									<b>{c.product.name}</b>
								{/if}
								<small>{c.product.brandName} · {c.product.category ?? '—'}</small>
							</td>
							<td data-l="인플루언서">
								{#if c.seller.code}
									<a href="{data.paths.sellers}/{encodeURIComponent(c.seller.code)}">{c.seller.name}</a>
								{:else}
									{c.seller.name}
								{/if}
								<GradeBox grade={c.seller.grade} sm />
								<small><PlatformHandle platform={c.seller.platform} handle={c.seller.handle} /></small>
							</td>
							<td class="num" data-l="성장세"><span class:up={c.seller.growth >= 0} class:down={c.seller.growth < 0}>{growth(c.seller.growth)}</span></td>
							<td class="num" data-l="3개월 매출">{won(c.seller.m3Sales)}</td>
							<td class="num" data-l="매칭 점수"><b>{fmtNum(c.score)}</b></td>
						</tr>
					{:else}
						<tr><td colspan="5" class="empty">자동 제안 ON 브랜드의 후보가 없습니다</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if sendCount > 0}
			<p class="match-foot match-cand-foot">"발송" 표시된 상위 {fmtNum(sendCount)}건이 이번 실행에 발송됩니다.</p>
		{/if}
	</div>

	<!-- 4. 이력 -->
	<div class="sec">
		자동 제안 이력
		<span class="badge">{fmtNum(v.history.length)}</span>
	</div>

	<div class="listcard match-history">
		{#each v.history as h (h.campaignId)}
			{@const chip = campaignStatusChip(h.status)}
			{@const href = h.campaignCode ? `${data.paths.campaigns}/${encodeURIComponent(h.campaignCode)}` : null}
			<svelte:element this={href ? 'a' : 'div'} class="rowitem" {href}>
				<span class="match-date console-mono">{md(h.createdAt)}</span>
				<div class="grow">
					<div class="nm">
						{h.productName ?? h.campaignCode ?? '—'}
						{#if h.campaignCode}<span class="console-mono meta">{h.campaignCode.toUpperCase()}</span>{/if}
					</div>
					<div class="sub">
						{h.brandName ?? '—'} → {h.sellerName ?? '—'}
						{#if h.sellerHandle}<span class="console-mono">{h.sellerHandle}</span>{/if}
					</div>
				</div>
				<div class="rowacts"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></div>
			</svelte:element>
		{:else}
			<div class="empty">아직 자동 제안이 없습니다 — 위에서 실행해보세요</div>
		{/each}
	</div>
{/if}

<style>
	.match-result-card {
		margin: 3px 3px 18px;
	}
	.match-result {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.match-result li {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 7px 0;
		font-size: 13px;
		word-break: keep-all;
	}
	.match-result li + li {
		border-top: 1px dashed var(--color-line-soft);
	}
	.match-result li .st {
		margin: 0;
	}
	.match-result .grow {
		flex: 1 1 240px;
		min-width: 0;
	}

	.match-2col {
		gap: 14px;
		margin-top: 18px;
		align-items: start;
	}
	.match-2col > .card {
		margin: 3px;
	}
	.match-lbl {
		margin-bottom: 4px;
	}
	.match-desc {
		font-size: 11.5px;
		color: var(--color-mute);
		margin: 0 0 12px;
		line-height: 1.5;
		word-break: keep-all;
	}

	/* 성장세 막대 — 데모 hb-row (이름 칸이 길어 폭만 넓힌다) */
	.match-rising {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.match-rising .hb-row {
		grid-template-columns: minmax(0, 1.4fr) minmax(60px, 1fr) 64px;
		cursor: default;
		padding: 6px 0;
	}
	.match-rising .hb-row + .hb-row {
		border-top: 1px dashed var(--color-line-soft);
	}
	.match-nm {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-wrap: wrap;
		min-width: 0;
		font-size: 12.5px;
	}
	.match-nm a {
		font-weight: 700;
		color: var(--color-ink);
	}
	.match-nm .rk {
		font-family: var(--font-mono);
		color: var(--color-mute);
		font-size: 11px;
	}
	.match-nm :global(.match-handle) {
		font-size: 11.5px;
		color: var(--color-mute);
	}
	.match-nm .st {
		margin: 0;
	}
	.up {
		color: var(--color-accent);
	}
	.down {
		color: var(--color-danger);
	}

	.match-brands {
		margin: 0 -18px;
		border-top: 1px dashed var(--color-line-soft);
	}
	.match-brands .rowitem {
		cursor: default;
		padding: 11px 18px;
	}
	.match-brands .nm {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.match-brands .nm a {
		color: var(--color-ink);
	}
	.match-brands form {
		margin: 0;
	}
	.match-brands button {
		margin: 0;
		min-width: 118px;
	}
	.match-foot {
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.6;
		margin: 12px 0 0;
		word-break: keep-all;
	}

	/* 후보 카드 — 데모처럼 머리줄(설명 + 실행 버튼) 아래 표를 카드 안에 붙인다 */
	.match-cand {
		padding: 0;
		overflow: hidden;
		margin: 3px;
	}
	.match-cand-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 14px 18px 10px;
	}
	.match-cand-head form {
		margin: 0;
	}
	.match-cand-head button {
		margin: 0;
	}
	.match-cand-desc {
		font-size: 12.5px;
		color: var(--color-mute);
		line-height: 1.6;
		word-break: keep-all;
		flex: 1 1 320px;
	}
	.match-excl {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		margin-left: 6px;
	}
	.match-excl .st {
		margin: 0;
	}
	.match-tbl {
		margin: 0;
		box-shadow: none;
		border-top: 2px solid var(--color-line-soft);
	}
	.match-tbl:hover {
		transform: none;
		box-shadow: none;
	}
	.match-tbl table {
		min-width: 720px;
	}
	.match-tbl td a {
		color: var(--color-ink);
	}
	.willsend td:first-child {
		box-shadow: inset 3px 0 0 var(--color-accent);
	}
	.match-send {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--color-accent);
		border: 1px solid currentColor;
		padding: 0 4px;
		margin-right: 6px;
		vertical-align: 1px;
	}
	.match-cand-foot {
		margin: 0;
		padding: 10px 18px 14px;
		border-top: 1px dashed var(--color-line-soft);
	}

	.match-history {
		margin: 3px;
	}
	.match-history .rowitem {
		color: inherit;
		text-decoration: none;
	}
	.match-history .nm {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}
	.match-history .sub .console-mono {
		margin-left: 4px;
		font-size: 11px;
	}
	.match-date {
		flex: 0 0 44px;
		font-size: 12px;
		color: var(--color-mute);
	}

	@media (max-width: 900px) {
		.match-2col {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		.match-tbl table {
			min-width: 0;
		}
		.willsend td:first-child {
			box-shadow: none;
		}
	}
</style>
