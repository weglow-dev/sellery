<script lang="ts">
	/**
	 * 상품 상세 — 데모 [실적] 모달(`ProductDetailModal`) + 검수 버튼을 화면으로 옮긴 것.
	 * UI 는 sellers/brands 상세 · 주문 상세와 같은 console-det / kv / actions 톤.
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
	const discount = $derived(
		p.consumer_price > p.sale_price ? Math.round((1 - p.sale_price / p.consumer_price) * 100) : 0
	);
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

<a href={data.listPath} class="btn ghost sm prod-back">← 상품</a>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}
{#if p.status === 'rejected' && p.reject_reason}
	<p class="notice danger" role="status">
		<b>반려 사유</b> — {p.reject_reason}
		<span class="meta">브랜드 상품 화면에 그대로 표시됩니다</span>
	</p>
{/if}

<section class="card static console-det">
	<ProductIcon emoji={p.emoji ?? '📦'} thumbUrl={p.thumb_url} size={52} />
	<div class="grow">
		<div class="t">
			{p.name}
			{#if p.code}<small>· {p.code}</small>{/if}
		</div>
		<div class="meta">
			<a href="{data.brandsPath}/{encodeURIComponent(p.brand_code ?? p.brand_id)}">{p.brand_name ?? '—'}</a>
			<GradeBox grade={p.brand_grade} sm />
			{#if p.category} · {p.category}{/if}
			· 판매가 <b>{money(p.sale_price)}</b>
			{#if p.consumer_price > p.sale_price}
				<s class="prod-strike">{money(p.consumer_price)}</s>
				{#if discount}<span class="chip auto">−{discount}%</span>{/if}
			{/if}
			· 수수료 {fee.total}
			{#if p.trend?.g}
				· <b class="prod-trend">▲{p.trend.g}{p.trend.note ? ` ${p.trend.note}` : ''}</b>
			{/if}
		</div>
		{#if p.description}
			<p class="prod-desc">{p.description}</p>
		{/if}
	</div>
	<div class="admin-det-status">
		<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
		{#if p.campaigns_live}
			<StatusChip tone="green">LIVE {p.campaigns_live}</StatusChip>
		{/if}
	</div>
</section>

<div class="mini-stats admin-strip prod-det-strip">
	<div>
		<span class="ms-l">확정 매출</span>
		<span class="ms-v">{money(p.net)}</span>
		<span class="ms-s">PAID 주문 − 환불</span>
	</div>
	<div>
		<span class="ms-l">판매</span>
		<span class="ms-v">{p.campaigns_total}건</span>
		<span class="ms-s">{p.campaigns_live ? `LIVE ${p.campaigns_live}` : '진행 중 없음'}</span>
	</div>
	<div>
		<span class="ms-l">재고</span>
		<span class="ms-v">{fmtNum(p.stock)}</span>
		<span class="ms-s">승인 시 0 이면 기본값으로 채워집니다</span>
	</div>
	<div>
		<span class="ms-l">총 수수료</span>
		<span class="ms-v">{fee.total}</span>
		<span class="ms-s">{fee.detail}</span>
	</div>
</div>

<p class="notice prod-sample-note">
	<b>샘플 정책</b> —
	{#if p.sample_free_grade}{p.sample_free_grade} 이상 무상 1회{:else}무상 제공 없음{/if}
	· 구매가
	{#if p.sample_buy_mode === 'fixed' && p.sample_fixed_price}
		브랜드 지정가 {money(p.sample_fixed_price)}
	{:else}
		자동 (판매가 − 인플루언서 수수료)
	{/if}
	{#if p.sample_refund} · 판매 확정 시 환급{/if}
	{#if p.sample_text} · {p.sample_text}{/if}
</p>

{#if p.exclusive_grade}
	<section class="card static prod-excl">
		<div class="lbl-sm">브랜드 독점권 오퍼</div>
		<p class="prod-excl-body">
			<b>{p.exclusive_label ?? '독점권'}</b> —
			<GradeBox grade={p.exclusive_grade} sm /> 등급 이상 인플루언서에게 드립니다.
			{#if p.exclusive_seller_id}
				<span class="meta"> · </span><StatusChip tone="green">독점 인플루언서 확정</StatusChip>
			{/if}
		</p>
	</section>
{/if}

<div class="console-det-body admin-det-body">
	<div>
		<section class="card static">
			<h4 class="admin-h4">상품 정보</h4>
			<dl class="console-kv">
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
					{#if p.consumer_price > p.sale_price}<span class="meta"> 정가 {money(p.consumer_price)}</span>{/if}
				</dd>
				<dt>수수료</dt>
				<dd>
					{fee.total}
					<span class="meta"> {fee.detail} — 인플루언서 몫은 브랜드가 정하고 플랫폼 몫은 고정입니다</span>
				</dd>
				{#if p.options.length}
					<dt>옵션</dt>
					<dd>
						{#each p.options as o (o.n)}
							<span class="prod-opt">{o.n} {money(o.price)}</span>
						{/each}
					</dd>
				{/if}
				<dt>등록 · 수정</dt>
				<dd>{md(p.created_at)} · {md(p.updated_at)}</dd>
			</dl>
		</section>

		<section class="card static">
			<h4 class="admin-h4">샘플 · 독점</h4>
			<dl class="console-kv">
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

		{#if p.image_urls?.length}
			<section class="card static">
				<h4 class="admin-h4">상세페이지 이미지 <span class="meta">{p.image_urls.length}장</span></h4>
				<div class="prod-imgs">
					{#each p.image_urls as u, i}
						<img src={u} alt="{p.name} 상세 이미지 {i + 1}" loading="lazy" />
					{/each}
				</div>
			</section>
		{/if}

		<section class="card static">
			<h4 class="admin-h4">판매 실적 <span class="meta">{p.campaigns.length}건</span></h4>
			<p class="hint prod-camp-hint">관리자는 인플루언서 실명을 그대로 봅니다. (인플루언서용 익명·블러·데이터 확인권은 없습니다)</p>
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
									<td data-l="인플루언서">
										{#if c.seller_code}
											<a href="{data.sellersPath}/{encodeURIComponent(c.seller_code)}">{c.seller_name ?? '—'}</a>
										{:else}
											{c.seller_name ?? '—'}
										{/if}
										{#if c.seller_handle}<span class="meta"> {c.seller_handle}</span>{/if}
									</td>
									<td class="num" data-l="팔로워">{c.seller_followers ? num(c.seller_followers) : '—'}</td>
									<td class="num" data-l="좋아요">{c.seller_likes_avg ? num(c.seller_likes_avg) : '—'}</td>
									<td class="num" data-l="참여율">{engagement(c)}</td>
									<td data-l="상태">
										{c.status}
										{#if c.code}<span class="console-mono meta"> {c.code}</span>{/if}
									</td>
									<td data-l="기간">{period(c)}</td>
									<td class="num" data-l="확정 매출"><b>{money(c.net)}</b></td>
									<td data-l="판매 페이지">
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
	</div>

	<div class="console-actions">
		<div class="card static">
			<h4>검수 — {chip.label}</h4>
			<p class="hint">
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
			<div class="btnrow">
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
					<form
						method="post"
						action="?/review"
						onsubmit={next.decision === 'pause'
							? ask(`${p.name} 의 노출을 중단할까요? 진행 중인 판매에는 영향이 없고 새 제안만 막힙니다.`)
							: undefined}
					>
						<input type="hidden" name="decision" value={next.decision} />
						<button type="submit" class="ghost sm">{next.label}</button>
					</form>
				{/if}
			</div>
		</div>

		<div class="card static">
			<h4>상세페이지</h4>
			<p class="hint">구매자에게 보이는 화면을 미리 확인합니다. 구매는 되지 않습니다.</p>
			<a href={data.previewPath} class="btn pri sm">상세페이지 미리보기 →</a>
		</div>
	</div>
</div>

<style>
	.prod-back {
		margin: 0 3px 12px;
	}
	.prod-det-strip {
		margin: 12px 3px 4px;
	}
	.prod-strike {
		opacity: 0.6;
		margin: 0 4px;
	}
	.prod-trend {
		color: var(--color-danger);
	}
	.prod-desc {
		margin: 8px 0 0;
		font-size: 13px;
		line-height: 1.55;
		color: var(--color-mute);
		word-break: keep-all;
	}
	.prod-sample-note {
		margin: 12px 3px 14px;
		font-size: 12.5px;
	}
	.prod-excl {
		margin-bottom: 14px;
	}
	.prod-excl-body {
		margin: 8px 0 0;
		font-size: 13px;
		line-height: 1.55;
	}
	.prod-opt {
		display: inline-block;
		margin: 0 8px 4px 0;
		font-size: 12.5px;
	}
	.prod-imgs img {
		display: block;
		width: 100%;
		max-width: 420px;
		border: 1.5px solid var(--color-line);
		margin-bottom: 8px;
	}
	.prod-camp-hint {
		font-size: 12.5px;
		color: var(--color-mute);
		margin: 0 0 12px;
		line-height: 1.55;
	}
	.console-actions form {
		margin: 0;
	}
</style>
