<script lang="ts">
	/**
	 * 상품 상세 — 데모의 [실적] 모달(`productDetail`)을 화면으로 옮긴 것 + 검수 버튼.
	 *   실적 띠: 확정 매출 · 판매 건수 · 재고 · 총 수수료.
	 *   상품 정보 · 옵션 · 샘플 정책 · 독점 설정.
	 *   캠페인 목록: 인플루언서(상세 링크) · 팔로워 · 좋아요 · 참여율 · 상태 · 기간 · 확정 매출 · 판매 페이지 링크(일정 확정 뒤).
	 *     데모 [실적] 모달(`ProductDetailModal` — 관리자·인플루언서 공용)의 표와 같은 칸이다. 다만 익명화 · 블러 ·
	 *     `🥬 2 매출 데이터 확인권` 은 **넣지 않는다** — 그건 남의 실적을 돈 내고 보는 인플루언서용 장치고, 관리자는 실명으로 전부 본다.
	 *   검수: 상태별 버튼(승인/반려 · 승인으로 변경 · 노출 중단/재개) + 반려 사유.
	 *   상세페이지 이미지: `products.image_urls`.
	 * 데모 [상세페이지] 버튼 → 헤더의 [상세페이지 미리보기 →] (`preview/`).
	 */
	import { nextListingDecision, productStatusChip, totalFeeLine } from '@sellery/db/admin/product-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { GradeBox, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const p = $derived(data.product);
	const chip = $derived(productStatusChip(p.status));
	const fee = $derived(totalFeeLine(p.commission_rate));
	const next = $derived(nextListingDecision(p.status));
	const money = (n: number) => `₩${fmtNum(n)}`;
	const num = (n: number) => fmtNum(n);
	/** 참여율 = 평균 좋아요 / 팔로워 — 데모 `ProductDetailModal` 과 같은 식. 팔로워 0 이면 계산할 수 없다 */
	const engagement = (c: { seller_followers: number | null; seller_likes_avg: number | null }) =>
		c.seller_followers && c.seller_likes_avg ? `${((c.seller_likes_avg / c.seller_followers) * 100).toFixed(1)}%` : '—';
	const ask = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
	function askReject(e: SubmitEvent) {
		const form = e.currentTarget as HTMLFormElement;
		const reason = prompt(`${p.name} 을 반려합니다. 사유를 입력하세요 (브랜드 상품 화면에 표시됩니다 · 200자 이내)`);
		if (!reason || !reason.trim()) {
			e.preventDefault();
			return;
		}
		(form.querySelector('input[name="reason"]') as HTMLInputElement).value = reason.trim().slice(0, 200);
	}
	const period = (c: { start_date: string | null; end_date: string | null }) =>
		c.start_date && c.end_date ? `${md(c.start_date)}–${md(c.end_date)}` : '미정';
</script>

<svelte:head>
	<title>{p.name} — 상품 · 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<a href={data.listPath} class="btn ghost sm">← 목록</a>
	<ProductIcon emoji={p.emoji ?? '📦'} thumbUrl={p.thumb_url} size={26} />
	<h2>{p.name}</h2>
	<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
	{#if p.code}<span class="console-mono meta">{p.code}</span>{/if}
	<a href={data.previewPath} class="btn ghost sm" style="margin-left:auto">상세페이지 미리보기 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}
{#if p.status === 'rejected' && p.reject_reason}
	<p class="notice danger" role="status"><b>반려 사유</b> — {p.reject_reason} <span class="meta">브랜드 상품 화면에 그대로 표시됩니다</span></p>
{/if}

<div class="mini-stats admin-strip" style="margin-top:0">
	<div><span class="ms-l">확정 매출</span><span class="ms-v">{money(p.net)}</span><span class="ms-s">PAID 주문 − 환불</span></div>
	<div><span class="ms-l">판매</span><span class="ms-v">{p.campaigns_total}건</span><span class="ms-s">{p.campaigns_live ? `LIVE ${p.campaigns_live}` : '진행 중 없음'}</span></div>
	<div><span class="ms-l">재고</span><span class="ms-v">{fmtNum(p.stock)}</span><span class="ms-s">승인 시 0 이면 기본값으로 채워집니다</span></div>
	<div><span class="ms-l">총 수수료</span><span class="ms-v">{fee.total}</span><span class="ms-s">{fee.detail}</span></div>
</div>

<!-- ---------------- 검수 ---------------- -->
<section class="card static">
	<h4>검수</h4>
	<div class="console-act">
		<div>
			<b>현재 상태 — {chip.label}</b>
			<p class="meta">
				{#if p.status === 'pending'}
					승인하면 노출 중으로 바뀌고 인플루언서 갤러리에 보입니다. 반려하면 사유가 브랜드에게 전달됩니다.
				{:else if p.status === 'rejected'}
					반려 상태입니다. 승인으로 바꾸면 바로 노출됩니다.
				{:else if p.status === 'listed'}
					노출 중입니다. 중단하면 새 제안이 막히고 진행 중인 판매에는 영향이 없습니다.
				{:else}
					노출이 중단된 상태입니다. 재개하면 다시 갤러리에 보입니다.
				{/if}
			</p>
		</div>
		<div class="admin-row-acts">
			{#if p.status === 'pending'}
				<form method="post" action="?/review">
					<input type="hidden" name="decision" value="approve" />
					<button type="submit" class="pri sm">승인</button>
				</form>
				<form method="post" action="?/review" onsubmit={askReject}>
					<input type="hidden" name="decision" value="reject" />
					<input type="hidden" name="reason" value="" />
					<button type="submit" class="danger sm">반려</button>
				</form>
			{:else if p.status === 'rejected'}
				<form method="post" action="?/review">
					<input type="hidden" name="decision" value="approve" />
					<button type="submit" class="ghost sm">승인으로 변경</button>
				</form>
			{:else}
				<form method="post" action="?/review" onsubmit={next.decision === 'pause' ? ask(`${p.name} 의 노출을 중단할까요? 진행 중인 판매에는 영향이 없고 새 제안만 막힙니다.`) : undefined}>
					<input type="hidden" name="decision" value={next.decision} />
					<button type="submit" class="ghost sm">{next.label}</button>
				</form>
			{/if}
		</div>
	</div>
</section>

<!-- ---------------- 상품 정보 ---------------- -->
<section class="card static">
	<h4>상품 정보</h4>
	<dl class="console-dl">
		<dt>브랜드</dt>
		<dd>
			<a href="{data.brandsPath}/{encodeURIComponent(p.brand_code ?? p.brand_id)}">{p.brand_name ?? '—'}</a>
			<GradeBox grade={p.brand_grade} sm />
		</dd>
		<dt>카테고리</dt>
		<dd>{p.category ?? '—'}</dd>
		{#if p.trend}
			<dt>트렌드</dt>
			<dd>{[p.trend.g, p.trend.note].filter(Boolean).join(' · ')}</dd>
		{/if}
		<dt>설명</dt>
		<dd>{p.description ?? '—'}</dd>
		<dt>가격</dt>
		<dd>
			<b>{money(p.sale_price)}</b>
			{#if p.consumer_price > p.sale_price}<span class="meta">정가 {money(p.consumer_price)}</span>{/if}
		</dd>
		<dt>수수료</dt>
		<dd>{fee.total} <span class="meta">{fee.detail} — 인플루언서 몫은 브랜드가 정하고 플랫폼 몫은 고정입니다</span></dd>
		{#if p.options.length}
			<dt>옵션</dt>
			<dd>
				{#each p.options as o (o.n)}
					<span class="admin-opt">{o.n} {money(o.price)}</span>
				{/each}
			</dd>
		{/if}
		<dt>등록 · 수정</dt>
		<dd>{md(p.created_at)} · {md(p.updated_at)}</dd>
	</dl>
</section>

<!-- ---------------- 샘플 · 독점 ---------------- -->
<section class="card static">
	<h4>샘플 · 독점</h4>
	<dl class="console-dl">
		<dt>무상 기준</dt>
		<dd>{p.sample_free_grade ? `${p.sample_free_grade} 이상 무상 1회` : '무상 제공 없음'}</dd>
		<dt>구매가</dt>
		<dd>
			{#if p.sample_buy_mode === 'fixed' && p.sample_fixed_price}
				브랜드 지정가 {money(p.sample_fixed_price)}
			{:else}
				자동 (판매가 − 인플루언서 수수료)
			{/if}
			{#if p.sample_refund} · <span class="meta">판매 확정 시 환급</span>{/if}
		</dd>
		{#if p.sample_text}
			<dt>샘플 안내</dt>
			<dd>{p.sample_text}</dd>
		{/if}
		<dt>독점</dt>
		<dd>
			{#if p.exclusive_grade}
				<GradeBox grade={p.exclusive_grade} sm />
				{p.exclusive_label ?? ''}
				{#if p.exclusive_seller_id}<StatusChip tone="green">확정</StatusChip>{/if}
			{:else}
				없음
			{/if}
		</dd>
	</dl>
</section>

<!-- ---------------- 상세페이지 이미지 ---------------- -->
{#if p.image_urls?.length}
	<section class="console-card">
		<h4>상세페이지 이미지 <span class="meta">{p.image_urls.length}장</span></h4>
		<div class="admin-prod-imgs">
			{#each p.image_urls as u, i}
				<img src={u} alt="{p.name} 상세 이미지 {i + 1}" loading="lazy" />
			{/each}
		</div>
	</section>
{/if}

<!-- ---------------- 캠페인(판매 실적) ---------------- -->
<section class="card static">
	<h4>판매 실적 <span class="meta">{p.campaigns.length}건</span></h4>
	{#if p.campaigns.length === 0}
		<p class="notice" role="status">이 상품으로 진행된 판매가 없습니다.</p>
	{:else}
		<div class="tblw admin-table">
			<table>
				<thead>
					<tr>
						<th>인플루언서</th>
						<th class="num">팔로워</th>
						<th class="num">좋아요</th>
						<th class="num">참여율</th>
						<th>상태</th>
						<th>기간</th>
						<th class="num">확정 매출</th>
						<th>판매 페이지</th>
					</tr>
				</thead>
				<tbody>
					{#each p.campaigns as c (c.id)}
						<tr>
							<td data-label="인플루언서">
								{#if c.seller_code}
									<a href="{data.sellersPath}/{encodeURIComponent(c.seller_code)}">{c.seller_name ?? '—'}</a>
								{:else}
									{c.seller_name ?? '—'}
								{/if}
								{#if c.seller_handle}<span class="meta"> {c.seller_handle}</span>{/if}
							</td>
							<td class="num" data-label="팔로워">{c.seller_followers ? num(c.seller_followers) : '—'}</td>
							<td class="num" data-label="좋아요">{c.seller_likes_avg ? num(c.seller_likes_avg) : '—'}</td>
							<td class="num" data-label="참여율">{engagement(c)}</td>
							<td data-label="상태">
								{c.status}
								{#if c.code}<span class="console-mono meta"> {c.code}</span>{/if}
							</td>
							<td data-label="기간">{period(c)}</td>
							<td data-label="확정 매출" class="num">{money(c.net)}</td>
							<td data-label="판매 페이지">
								{#if c.store_url}
									<a href="{data.siteUrl}{c.store_url}" target="_blank" rel="noopener noreferrer">열기 ↗</a>
								{:else}
									<span class="meta">일정 확정 전</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	/* 상세페이지 이미지 — 세로로 이어지는 상세 컷(폭 100%)이라 한 장씩 쌓는다 */
	.admin-prod-imgs img {
		display: block;
		width: 100%;
		max-width: 420px;
		border: 1.5px solid var(--color-line);
		margin-bottom: 8px;
	}

	.admin-row-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.admin-opt {
		display: inline-block;
		margin: 0 8px 4px 0;
		font-size: 12.5px;
	}
</style>
