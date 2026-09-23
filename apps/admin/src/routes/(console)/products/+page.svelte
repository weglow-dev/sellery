<script lang="ts">
	/**
	 * 상품 검수 — 데모 `(demo)/products`(프로토타입 `vAdminProducts`) 의 DB 판.
	 *   상단: 카테고리 정책 안내 + 상태 칩(전체 · 검수 대기 · 노출 중 · 노출 중단 · 반려) + 브랜드 칩 + 카테고리 칩 + 검색.
	 *   표(등록일 내림차순): 상품(아이콘·이름·설명·code) · 브랜드(+등급) · 카테고리 · 판매가(정가 취소선) ·
	 *      총 수수료(인플+플랫폼) · 재고 · 판매·매출(건수·LIVE·확정 매출) · 독점 · 상태 · 관리.
	 *   관리 버튼은 상태에 따라 갈린다(데모와 같다):
	 *      pending  → [승인] [반려](사유 입력)
	 *      rejected → 사유 표시 + [승인으로 변경]
	 *      listed   → [노출 중단]   ·   paused → [재개]
	 *   되돌리기 비용이 있는 것(반려 · 노출 중단)에만 confirm 을 건다.
	 *   **행 전체가 상세 링크** — 관리 칸의 버튼·폼과 브랜드 링크는 `closest()` 로 제외한다(sellers · brands 와 같은 규칙).
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
	/** 반려 — 사유를 prompt 로 받아 hidden 에 채운다(데모 `rejectProduct` 가 prompt 를 쓰던 자리) */
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

<div class="console-head">
	<h2>상품</h2>
	<span class="meta">전 브랜드 등록 상품 {data.counts.all}개 · 검수 승인/반려 · 노출 제어</span>
	{#if data.counts.pending}<span class="badge">검수 대기 {data.counts.pending}</span>{/if}
</div>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<p class="notice"><b>카테고리 정책</b> — {CATEGORY_POLICY_NOTE}</p>

<div class="console-filters">
	{#each data.statusChips as c (c.key)}
		<a href={c.href} class={c.key === (data.status ?? '') ? 'chip on' : 'chip'}>{c.label}<b> {c.count}</b></a>
	{/each}
</div>
<div class="console-filters">
	{#each data.brandChips as c (c.key)}
		<a href={c.href} class={c.key === (data.brand ?? '') ? 'chip on' : 'chip'}>{c.label}<b> {c.count}</b></a>
	{/each}
</div>
<div class="console-filters">
	{#each data.categoryChips as c (c.key)}
		<a href={c.href} class={c.key === (data.category ?? '') ? 'chip on' : 'chip'}>{c.label}<b> {c.count}</b></a>
	{/each}
</div>

<form method="get" action={data.self} class="console-search">
	{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
	{#if data.brand}<input type="hidden" name="brand" value={data.brand} />{/if}
	{#if data.category}<input type="hidden" name="category" value={data.category} />{/if}
	<input type="search" name="q" value={data.q} placeholder="상품명 · 설명 · 코드 · 카테고리 검색" aria-label="상품 검색" />
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

{#if data.rows.length === 0}
	<p class="notice" role="status">{data.q ? `"${data.q}" 에 맞는 상품이 없어요.` : '조건에 맞는 상품이 없어요.'}</p>
{:else}
	<div class="tblw admin-table">
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
					<tr class="clickable" onclick={rowClick(p)} onkeydown={rowKey(p)} tabindex="0" role="link" aria-label="{p.name} 상세">
						<td data-label="상품">
							<span class="admin-prod-cell">
								<ProductIcon emoji={p.emoji ?? '📦'} thumbUrl={p.thumb_url} size={24} />
								<span>
									<a href={detail(p)}><b>{p.name}</b></a>
									{#if p.code}<span class="console-mono meta"> {p.code}</span>{/if}
									<span class="meta admin-prod-sub">{p.description ?? '—'}</span>
								</span>
							</span>
						</td>
						<td data-label="브랜드">
							<a href="{data.brandsPath}/{encodeURIComponent(p.brand_code ?? p.brand_id)}">{p.brand_name ?? '—'}</a>
							<GradeBox grade={p.brand_grade} sm />
						</td>
						<td data-label="카테고리">{p.category ?? '—'}</td>
						<td data-label="판매가" class="num">
							<b>{money(p.sale_price)}</b>
							{#if p.consumer_price > p.sale_price}<span class="meta admin-prod-strike">{money(p.consumer_price)}</span>{/if}
						</td>
						<td data-label="총 수수료" class="num">
							{fee.total}
							<span class="meta admin-prod-sub">{fee.detail}</span>
						</td>
						<td data-label="재고" class="num">{fmtNum(p.stock)}</td>
						<td data-label="판매 · 매출" class="num">
							{p.campaigns_total}건
							{#if p.campaigns_live}<StatusChip tone="green">LIVE {p.campaigns_live}</StatusChip>{/if}
							<span class="meta admin-prod-sub">{money(p.net)}</span>
						</td>
						<td data-label="독점">
							{#if p.exclusive_grade}
								<GradeBox grade={p.exclusive_grade} sm />
								{#if p.exclusive_seller_id}<StatusChip tone="green">확정</StatusChip>{/if}
							{:else}
								<span class="meta">—</span>
							{/if}
						</td>
						<td data-label="상태">
							<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
							{#if p.status === 'rejected' && p.reject_reason}<span class="meta admin-prod-sub">{p.reject_reason}</span>{/if}
						</td>
						<td data-label="관리">
							<div class="admin-row-acts">
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
										onsubmit={next.decision === 'pause' ? ask(`${p.name} 의 노출을 중단할까요? 진행 중인 판매에는 영향이 없고 새 제안만 막힙니다.`) : undefined}
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
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.admin-prod-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.admin-prod-sub {
		display: block;
		font-size: 11.5px;
	}
	.admin-prod-strike {
		display: block;
		font-size: 11px;
		text-decoration: line-through;
	}
	.admin-row-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	tr.clickable {
		cursor: pointer;
	}
</style>
