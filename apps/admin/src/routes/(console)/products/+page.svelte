<script lang="ts">
	/**
	 * 상품 검수 — 데모 `(demo)/products` 의 DB 판.
	 * UI 는 sellers/brands 목록과 같은 h2.pg · mini-stats · cats · admin-search · admin-table 톤.
	 * 상태·브랜드·카테고리 필터 · 행 클릭 상세 · 승인/반려/노출 form 액션은 그대로 둔다.
	 */
	import { CATEGORY_POLICY_NOTE, nextListingDecision, productStatusChip, totalFeeLine } from '@sellery/db/admin/product-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { GradeBox, ProductIcon, StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const money = (n: number) => `₩${fmtNum(n)}`;
	const detail = (p: { code: string | null; id: string }) => `${data.self}/${encodeURIComponent(p.code ?? p.id)}`;
	function rowClick(p: { code: string | null; id: string }) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			goto(detail(p));
		};
	}
	function rowKey(p: { code: string | null; id: string }) {
		return (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			e.preventDefault();
			goto(detail(p));
		};
	}
	const ask = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
	/** 반려 — 사유를 prompt 로 받아 hidden 에 채운다(데모 `rejectProduct` 자리) */
	function askReject(name: string) {
		return (e: SubmitEvent) => {
			const form = e.currentTarget as HTMLFormElement;
			const reason = prompt(`${name} 을 반려합니다. 사유를 입력하세요 (브랜드 상품 화면에 표시됩니다 · 200자 이내)`);
			if (!reason || !reason.trim()) {
				e.preventDefault();
				return;
			}
			(form.querySelector('input[name="reason"]') as HTMLInputElement).value = reason.trim().slice(0, 200);
		};
	}
</script>

<svelte:head>
	<title>상품 검수 — 셀러리 관리자</title>
</svelte:head>

<h2 class="pg">
	상품
	<small>전 브랜드 등록 상품 {data.counts.all}개 · 검수 승인/반려 · 노출 제어 · 상세페이지 확인</small>
</h2>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<div class="mini-stats admin-strip prods-strip">
	<div>
		<span class="ms-l">전체</span>
		<span class="ms-v">{data.counts.all}</span>
		<span class="ms-s">등록 상품</span>
	</div>
	<div>
		<span class="ms-l">검수 대기</span>
		<span class="ms-v" style={data.counts.pending ? 'color:var(--color-danger)' : ''}>{data.counts.pending ?? 0}</span>
		<span class="ms-s">
			{#if data.counts.pending}
				<a href="{data.self}?status=pending">대기 목록 보기 →</a>
			{:else}
				처리할 건 없음
			{/if}
		</span>
	</div>
	<div>
		<span class="ms-l">노출 중</span>
		<span class="ms-v">{data.counts.listed ?? 0}</span>
		<span class="ms-s">갤러리 노출</span>
	</div>
	<div>
		<span class="ms-l">중단 · 반려</span>
		<span class="ms-v">{(data.counts.paused ?? 0) + (data.counts.rejected ?? 0)}</span>
		<span class="ms-s">중단 {data.counts.paused ?? 0} · 반려 {data.counts.rejected ?? 0}</span>
	</div>
</div>

<p class="notice prods-policy"><b>카테고리 정책</b> — {CATEGORY_POLICY_NOTE}</p>

<nav class="cats" aria-label="상태 필터">
	{#each data.statusChips as c (c.key)}
		<a
			href={c.href}
			class="catchip {c.key === (data.status ?? '') ? 'on' : ''}"
			aria-current={c.key === (data.status ?? '') ? 'page' : undefined}
		>
			{c.label}<span class="n"> {c.count}</span>
		</a>
	{/each}
</nav>

<nav class="cats prods-subchips" aria-label="브랜드 필터">
	{#each data.brandChips as c (c.key)}
		<a
			href={c.href}
			class="catchip sm {c.key === (data.brand ?? '') ? 'on' : ''}"
			aria-current={c.key === (data.brand ?? '') ? 'page' : undefined}
		>
			{c.label}<span class="n"> {c.count}</span>
		</a>
	{/each}
</nav>

<nav class="cats console-filters prods-subchips" aria-label="카테고리 필터">
	{#each data.categoryChips as c (c.key)}
		<a
			href={c.href}
			class="catchip sm {c.key === (data.category ?? '') ? 'on' : ''}"
			aria-current={c.key === (data.category ?? '') ? 'page' : undefined}
		>
			{c.label}<span class="n"> {c.count}</span>
		</a>
	{/each}
</nav>

<form method="get" action={data.self} class="admin-search" role="search">
	{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
	{#if data.brand}<input type="hidden" name="brand" value={data.brand} />{/if}
	{#if data.category}<input type="hidden" name="category" value={data.category} />{/if}
	<input
		type="search"
		name="q"
		value={data.q}
		placeholder="상품명 · 설명 · 코드 · 카테고리 검색"
		aria-label="상품 검색"
	/>
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta prods-count">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

<div class="tblw admin-table prods-table">
	<table>
		<thead>
			<tr>
				<th>상품</th>
				<th>브랜드</th>
				<th>카테고리</th>
				<th class="num">판매가</th>
				<th class="num">총 수수료</th>
				<th class="num">재고</th>
				<th class="num">판매 · 매출</th>
				<th>독점</th>
				<th>상태</th>
				<th>관리</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as p (p.id)}
				{@const chip = productStatusChip(p.status)}
				{@const fee = totalFeeLine(p.commission_rate)}
				{@const next = nextListingDecision(p.status)}
				<tr
					class="clickable {p.status === 'pending' ? 'row-due' : ''}"
					onclick={rowClick(p)}
					onkeydown={rowKey(p)}
					tabindex="0"
					role="link"
					aria-label="{p.name} 상세"
				>
					<td class="nm" data-l="상품">
						<span class="prods-cell">
							<ProductIcon emoji={p.emoji ?? '📦'} thumbUrl={p.thumb_url} size={24} />
							<span class="prods-cell-text">
								<a href={detail(p)}><b>{p.name}</b></a>
								{#if p.code}<span class="console-mono meta"> {p.code}</span>{/if}
								<span class="prods-sub">{p.description ?? '—'}</span>
							</span>
						</span>
					</td>
					<td data-l="브랜드">
						<a href="{data.brandsPath}/{encodeURIComponent(p.brand_code ?? p.brand_id)}">{p.brand_name ?? '—'}</a>
						<GradeBox grade={p.brand_grade} sm />
					</td>
					<td data-l="카테고리">{p.category ?? '—'}</td>
					<td class="num" data-l="판매가">
						<b>{money(p.sale_price)}</b>
						{#if p.consumer_price > p.sale_price}
							<span class="prods-strike">{money(p.consumer_price)}</span>
						{/if}
					</td>
					<td class="num" data-l="총 수수료">
						{fee.total}
						<span class="prods-sub">{fee.detail}</span>
					</td>
					<td class="num" data-l="재고">{fmtNum(p.stock)}</td>
					<td class="num" data-l="판매 · 매출">
						{p.campaigns_total}건
						{#if p.campaigns_live}
							<small><StatusChip tone="green">LIVE {p.campaigns_live}</StatusChip></small>
						{/if}
						<span class="prods-sub">{money(p.net)}</span>
					</td>
					<td data-l="독점">
						{#if p.exclusive_grade}
							<GradeBox grade={p.exclusive_grade} sm />
							{#if p.exclusive_seller_id}<StatusChip tone="green">확정</StatusChip>{/if}
						{:else}
							<span class="meta">—</span>
						{/if}
					</td>
					<td data-l="상태">
						<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
						{#if p.status === 'rejected' && p.reject_reason}
							<span class="prods-sub">{p.reject_reason}</span>
						{/if}
					</td>
					<td data-l="관리" class="admin-row-act">
						<div class="prods-acts">
							{#if p.status === 'pending'}
								<form method="post" action="?/review">
									<input type="hidden" name="product" value={p.code ?? p.id} />
									<input type="hidden" name="decision" value="approve" />
									<button type="submit" class="pri sm">승인</button>
								</form>
								<form method="post" action="?/review" onsubmit={askReject(p.name)}>
									<input type="hidden" name="product" value={p.code ?? p.id} />
									<input type="hidden" name="decision" value="reject" />
									<input type="hidden" name="reason" value="" />
									<button type="submit" class="danger sm">반려</button>
								</form>
							{:else if p.status === 'rejected'}
								<form method="post" action="?/review">
									<input type="hidden" name="product" value={p.code ?? p.id} />
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
									<input type="hidden" name="product" value={p.code ?? p.id} />
									<input type="hidden" name="decision" value={next.decision} />
									<button type="submit" class="ghost sm">{next.label}</button>
								</form>
							{/if}
							<a href="{detail(p)}/preview" class="btn ghost sm">상세페이지</a>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="10" class="empty">
						{data.q ? `"${data.q}" 에 맞는 상품이 없어요.` : '조건에 맞는 상품이 없어요.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.prods-strip {
		margin: 0 3px 14px;
	}
	.prods-policy {
		margin: 0 3px 14px;
		font-size: 12.5px;
	}
	.prods-subchips {
		margin-top: -6px;
	}
	.prods-count {
		white-space: nowrap;
		font-size: 12px;
	}
	.prods-table td {
		vertical-align: top;
	}
	.prods-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.prods-cell-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.prods-sub {
		display: block;
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.45;
	}
	.prods-strike {
		display: block;
		font-size: 11px;
		color: var(--color-mute);
		text-decoration: line-through;
	}
	.prods-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.prods-acts form {
		margin: 0;
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover td {
		background: color-mix(in srgb, var(--color-lime) 12%, transparent);
	}
</style>
