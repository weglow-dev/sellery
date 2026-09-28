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
</script>

<svelte:head>
	<title>매칭·자동 제안 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>매칭·자동 제안</h2>
	<span class="meta">뜨는 인플루언서를 브랜드 상품과 자동 매칭 · 브랜드별 자동 제안 ON/OFF</span>
</div>

{#if form?.toggleError}<p class="notice danger" role="alert">{form.toggleError}</p>{/if}
{#if form?.runError}<p class="notice danger" role="alert">{form.runError}</p>{/if}

{#if form?.rows}
	<section class="console-card">
		<h4>자동 제안 실행 결과 <span class="meta">{form.summary}</span></h4>
		<ul class="match-result">
			{#each form.rows as r (r.productCode + r.sellerHandle)}
				<li class:bad={!r.ok}>
					<b>{r.productName}</b> → {r.sellerName} <span class="console-mono">{r.sellerHandle}</span>
					{#if r.ok}
						· 제안 발송
						{#if r.campaignCode}
							<a href="{data.paths.campaigns}/{encodeURIComponent(r.campaignCode)}">{r.campaignCode}</a>
						{/if}
					{:else}
						· <span class="down">{r.reason}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if !v}
	<p class="notice danger" role="status">매칭 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
{:else}
	<div class="match-2col">
		<!-- 1. 요즘 뜨는 인플루언서 -->
		<section class="console-card">
			<h4>요즘 뜨는 인플루언서</h4>
			<p class="meta">최근 게시물 반응 성장률(후반 평균 vs 전반 평균) · 관리자는 비공개 계정도 실명으로 봅니다</p>
			<ol class="match-rising">
				{#each v.rising as s, i (s.id)}
					<li>
						<span class="nm">
							{i + 1}.
							{#if s.code}
								<a href="{data.paths.sellers}/{encodeURIComponent(s.code)}">{s.name}</a>
							{:else}
								{s.name}
							{/if}
							<span class="console-mono meta">{s.handle}</span>
							{#if s.grade}<span class="meta">{s.grade}</span>{/if}
							{#if !s.eligible}<span class="st gray">{s.reason}</span>{/if}
						</span>
						<span class="track"><span class="bar" class:top={i === 0} style="width:{barWidth(s.growth, topGrowth)}"></span></span>
						<span class="val">{growth(s.growth)}</span>
					</li>
				{/each}
			</ol>
		</section>

		<!-- 2. 브랜드 자동 제안 ON/OFF -->
		<section class="console-card">
			<h4>브랜드 자동 제안</h4>
			<ul class="match-brands">
				{#each v.brands as b (b.id)}
					<li>
						<span class="nm">
							{#if b.code}
								<a href="{data.paths.brands}/{encodeURIComponent(b.code)}">{b.name}</a>
							{:else}
								{b.name}
							{/if}
							{#if b.grade}<span class="meta">{b.grade}</span>{/if}
							<span class="meta">노출 상품 {fmtNum(b.listedProducts)}개 · 🥬 {fmtNum(b.celery)}</span>
						</span>
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="brand" value={b.code ?? b.id} />
							<input type="hidden" name="on" value={b.autoPropose ? '0' : '1'} />
							<button type="submit" class="sm {b.autoPropose ? 'pri' : 'ghost'}">
								{b.autoPropose ? '자동 제안 ON' : '자동 제안 OFF'}
							</button>
						</form>
					</li>
				{/each}
			</ul>
			<p class="meta">
				ON 이면 카테고리 적합도 × 성장세 × 매출/팔로워 점수로 상위 인플루언서에게 브랜드 명의로 제안합니다.
				비공개 계정과 우선권 등급(플래티넘 이상)은 제안 대상이 아닙니다 — 갤러리 열람·🥬 제안권이 6단계입니다.
			</p>
		</section>
	</div>

	<!-- 3. 후보 + 실행 -->
	<section class="console-card">
		<div class="match-head">
			<h4>자동 제안 후보 <span class="meta">{fmtNum(v.candidates.length)}건</span></h4>
			<form method="POST" action="?/run" use:enhance>
				<button type="submit" class="pri sm" disabled={sendCount === 0}>오늘 자동 제안 실행 ({fmtNum(sendCount)}건)</button>
			</form>
		</div>
		<p class="meta">
			상품별 상위 2명 · 진행 중 캠페인·독점 확정 상품 제외 · 실행 시 점수 상위 {fmtNum(data.batch)}건 발송
			{#if v.excluded.hidden || v.excluded.priority || v.excluded.unverified || v.excluded.suspended}
				· 제외된 인플루언서
				{#if v.excluded.hidden}비공개 {v.excluded.hidden}명{/if}
				{#if v.excluded.priority} · 우선권 등급 {v.excluded.priority}명{/if}
				{#if v.excluded.unverified} · 채널 미인증 {v.excluded.unverified}명{/if}
				{#if v.excluded.suspended} · 정지 {v.excluded.suspended}명{/if}
			{/if}
		</p>

		{#if v.candidates.length === 0}
			<p class="notice" role="status">자동 제안 ON 브랜드의 후보가 없습니다.</p>
		{:else}
			<div class="tblw admin-table">
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
									{#if c.product.code}
										<a href="{data.paths.products}/{encodeURIComponent(c.product.code)}">{c.product.name}</a>
									{:else}
										{c.product.name}
									{/if}
									<span class="meta"> {c.product.brandName} · {c.product.category ?? '—'}</span>
								</td>
								<td data-l="인플루언서">
									{#if c.seller.code}
										<a href="{data.paths.sellers}/{encodeURIComponent(c.seller.code)}">{c.seller.name}</a>
									{:else}
										{c.seller.name}
									{/if}
									<span class="console-mono meta">{c.seller.handle}</span>
									{#if c.seller.grade}<span class="meta">{c.seller.grade}</span>{/if}
								</td>
								<td class="num" data-l="성장세">{growth(c.seller.growth)}</td>
								<td class="num" data-l="3개월 매출">{won(c.seller.m3Sales)}</td>
								<td class="num" data-l="매칭 점수"><b>{fmtNum(c.score)}</b></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="meta">굵게 표시된 상위 {fmtNum(sendCount)}건이 이번 실행에 발송됩니다.</p>
		{/if}
	</section>

	<!-- 4. 이력 -->
	<section class="console-card">
		<h4>자동 제안 이력 <span class="meta">{fmtNum(v.history.length)}건</span></h4>
		{#if v.history.length === 0}
			<p class="meta">아직 자동 제안이 없습니다 — 위에서 실행해보세요.</p>
		{:else}
			<div class="tblw admin-table">
				<table>
					<thead>
						<tr>
							<th>보낸 날</th>
							<th>상품</th>
							<th>인플루언서</th>
							<th>브랜드</th>
							<th>상태</th>
						</tr>
					</thead>
					<tbody>
						{#each v.history as h (h.campaignId)}
							{@const chip = campaignStatusChip(h.status)}
							<tr>
								<td data-l="보낸 날">{md(h.createdAt)}</td>
								<td data-l="상품">
									{#if h.campaignCode}
										<a href="{data.paths.campaigns}/{encodeURIComponent(h.campaignCode)}">{h.productName ?? h.campaignCode}</a>
									{:else}
										{h.productName ?? '—'}
									{/if}
									{#if h.campaignCode}<span class="console-mono meta">{h.campaignCode}</span>{/if}
								</td>
								<td data-l="인플루언서">{h.sellerName ?? '—'} <span class="console-mono meta">{h.sellerHandle ?? ''}</span></td>
								<td data-l="브랜드">{h.brandName ?? '—'}</td>
								<td data-l="상태"><span class="st {chip.tone}">{chip.label}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	.match-2col {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}

	.match-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	/* 성장세 막대 — 데모 hb-row */
	.match-rising {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.match-rising li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 80px 64px;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
	}
	.match-rising li + li {
		border-top: 1px solid var(--color-line);
	}
	.match-rising .nm {
		min-width: 0;
	}
	.match-rising .track {
		height: 8px;
		border: 1px solid var(--color-line);
		display: block;
	}
	.match-rising .bar {
		display: block;
		height: 100%;
		background: var(--color-line);
	}
	.match-rising .bar.top {
		background: var(--color-accent, #4a7);
	}
	.match-rising .val {
		text-align: right;
		white-space: nowrap;
	}

	.match-brands {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
	}
	.match-brands li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 0;
	}
	.match-brands li + li {
		border-top: 1px solid var(--color-line);
	}

	.match-result {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.match-result li {
		padding: 5px 0;
	}
	.match-result li + li {
		border-top: 1px solid var(--color-line);
	}
	.match-result li.bad {
		opacity: 0.85;
	}

	/* 이번 실행에 나갈 행 */
	.willsend td {
		font-weight: 600;
	}
	.down {
		color: var(--color-danger, #c0392b);
	}
</style>
