<script lang="ts">
	/**
	 * 브랜드 목록 — 데모 `(demo)/brands` 의 DB 판.
	 * UI 는 인플루언서 목록(`sellers/+page`)과 같은 h2.pg · mini-stats · cats · admin-search · admin-table 톤.
	 * 상태 필터 · 행 클릭 상세 · 자동 제안 · 지급 form 액션은 그대로 둔다.
	 */
	import { autoProposeLabel, brandStatusChip, productCountLine, settleInfoChip } from '@sellery/db/admin/brand-rules';
	import { fmtNum, imageSrc } from '@sellery/db/campaign';
	import { GradeBox, StatusChip } from '@sellery/ui/site';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const detail = (b: { code: string | null; id: string }) => `${data.self}/${encodeURIComponent(b.code ?? b.id)}`;
	const money = (n: number) => `₩${fmtNum(n)}`;

	function rowClick(b: { code: string | null; id: string }) {
		return (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			goto(detail(b));
		};
	}
	function rowKey(b: { code: string | null; id: string }) {
		return (e: KeyboardEvent) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if ((e.target as HTMLElement).closest('a,button,form,input')) return;
			e.preventDefault();
			goto(detail(b));
		};
	}
	const confirmGrant = (name: string) => (e: SubmitEvent) => {
		if (!confirm(`${name} 에게 🥬 를 지급할까요? 누를 때마다 원장에 적재되며 되돌리려면 운영 조정이 필요합니다.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>브랜드 — 셀러리 관리자</title>
</svelte:head>

<h2 class="pg">
	브랜드
	<small>
		입점 {data.counts.all}개 · 정지 {data.counts.suspended} · 정산 정보 미등록 {data.counts.noSettleInfo} · 검수 대기 보유
		{data.counts.pendingProduct}
	</small>
</h2>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<div class="mini-stats admin-strip brands-strip">
	<div>
		<span class="ms-l">입점</span>
		<span class="ms-v">{data.counts.all}</span>
		<span class="ms-s">전체 브랜드</span>
	</div>
	<div>
		<span class="ms-l">검수 대기 보유</span>
		<span class="ms-v" style={data.counts.pendingProduct ? 'color:var(--color-danger)' : ''}>{data.counts.pendingProduct}</span>
		<span class="ms-s">
			{#if data.counts.pendingProduct}
				<a href="{data.self}?filter=pending_product">대기 목록 보기 →</a>
			{:else}
				처리할 건 없음
			{/if}
		</span>
	</div>
	<div>
		<span class="ms-l">정산 정보 미등록</span>
		<span class="ms-v" style={data.counts.noSettleInfo ? 'color:var(--color-danger)' : ''}>{data.counts.noSettleInfo}</span>
		<span class="ms-s">이체·정산 전 확인</span>
	</div>
	<div>
		<span class="ms-l">정지</span>
		<span class="ms-v" style={data.counts.suspended ? 'color:var(--color-danger)' : ''}>{data.counts.suspended}</span>
		<span class="ms-s">콘솔 입장 차단</span>
	</div>
</div>

<nav class="cats console-filters" aria-label="상태 필터">
	{#each data.statusChips as c (c.key)}
		<a
			href={c.href}
			class="catchip {c.key === data.filter ? 'on' : ''}"
			aria-current={c.key === data.filter ? 'page' : undefined}
		>
			{c.label}{#if c.count !== null}<span class="n"> {c.count}</span>{/if}
		</a>
	{/each}
</nav>

<nav class="cats console-filters brands-grades" aria-label="등급 필터">
	{#each data.gradeChips as g (g.key)}
		<a
			href={g.href}
			class="catchip sm {(g.key || null) === data.grade ? 'on' : ''}"
			aria-current={(g.key || null) === data.grade ? 'page' : undefined}
		>
			{g.label}<span class="n"> {g.count}</span>
		</a>
	{/each}
</nav>

<form method="get" action={data.self} class="admin-search" role="search">
	{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
	{#if data.grade}<input type="hidden" name="grade" value={data.grade} />{/if}
	<input
		type="search"
		name="q"
		value={data.q}
		placeholder="상호 · 담당자 · 이메일 · 코드 · 카테고리 검색"
		aria-label="브랜드 검색"
	/>
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta brands-count">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

<div class="tblw admin-table brands-table">
	<table>
		<thead>
			<tr>
				<th>브랜드</th>
				<th>등급 · 누적 GMV</th>
				<th class="num">상품</th>
				<th class="num">판매</th>
				<th>정산 정보</th>
				<th class="num">셀러리</th>
				<th>자동 제안</th>
				<th>관리</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as b (b.id)}
				{@const chip = brandStatusChip(b)}
				{@const si = settleInfoChip(b)}
				<tr
					class="clickable"
					onclick={rowClick(b)}
					onkeydown={rowKey(b)}
					tabindex="0"
					role="link"
					aria-label="{b.name} 상세"
				>
					<td class="nm" data-l="브랜드">
						<span class="brands-cell">
							{#if imageSrc(b.logo_url)}
								<img src={imageSrc(b.logo_url)} alt="" class="brands-logo" />
							{/if}
							<span class="brands-cell-text">
								<a href={detail(b)}><b>{b.name}</b></a>
								<span class="brands-meta-line">
									{#if b.code}<span class="console-mono meta">{b.code}</span>{/if}
									{#if !b.active}<StatusChip tone={chip.tone}>{chip.label}</StatusChip>{/if}
								</span>
								<span class="brands-sub">
									{[b.category, b.manager_name, b.email].filter(Boolean).join(' · ') || '—'}{#if b.referrer_name}
										· 추천: {b.referrer_name}{/if}
								</span>
							</span>
						</span>
					</td>
					<td data-l="등급 · 누적 GMV">
						<GradeBox grade={b.grade} sm />
						<span class="brands-sub">{money(b.gmv)}</span>
					</td>
					<td class="num" data-l="상품">
						{b.products_total}
						<span class="brands-sub">{productCountLine(b)}</span>
					</td>
					<td class="num" data-l="판매">
						{b.campaigns_total}
						{#if b.campaigns_live}
							<small><StatusChip tone="green">LIVE {b.campaigns_live}</StatusChip></small>
						{/if}
					</td>
					<td data-l="정산 정보">
						<StatusChip tone={si.tone}>{si.label}</StatusChip>
						{#if b.has_bank_info}<span class="brands-sub">사업자 {b.biz_no ?? '—'}</span>{/if}
					</td>
					<td class="num" data-l="셀러리">🥬 {b.celery}</td>
					<td data-l="자동 제안">
						<form method="post" action="?/auto">
							<input type="hidden" name="brand" value={b.code ?? b.id} />
							<input type="hidden" name="on" value={b.auto_propose ? 'false' : 'true'} />
							<button type="submit" class={b.auto_propose ? 'pri sm' : 'ghost sm'}>{autoProposeLabel(b.auto_propose)}</button>
						</form>
					</td>
					<td data-l="관리" class="admin-row-act">
						<div class="brands-acts">
							<form method="post" action="?/grant" onsubmit={confirmGrant(b.name)}>
								<input type="hidden" name="brand" value={b.code ?? b.id} />
								<button type="submit" class="ghost sm">🥬 +3 지급</button>
							</form>
							<a href="{data.productsPath}?brand={encodeURIComponent(b.code ?? b.id)}" class="btn ghost sm">상품 보기</a>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="8" class="empty">
						{data.q ? `"${data.q}" 에 맞는 브랜드가 없어요.` : '해당하는 브랜드가 없어요.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.brands-strip {
		margin: 0 3px 16px;
	}
	.brands-grades {
		margin-top: -6px;
	}
	.brands-count {
		white-space: nowrap;
		font-size: 12px;
	}
	.brands-table td {
		vertical-align: top;
	}
	.brands-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.brands-logo {
		width: 26px;
		height: 26px;
		border: 1.5px solid var(--color-soft-line);
		flex: none;
		object-fit: cover;
	}
	.brands-cell-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.brands-meta-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--color-mute);
	}
	.brands-sub {
		display: block;
		font-size: 11.5px;
		color: var(--color-mute);
		line-height: 1.45;
	}
	.brands-acts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.brands-acts form {
		margin: 0;
	}
	tr.clickable {
		cursor: pointer;
	}
	tr.clickable:hover td {
		background: color-mix(in srgb, var(--color-lime) 12%, transparent);
	}
</style>
