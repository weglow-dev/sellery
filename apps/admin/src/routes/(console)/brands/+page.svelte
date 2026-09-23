<script lang="ts">
	/**
	 * 브랜드 목록 — 데모 `(demo)/brands`(프로토타입 `vAdminBrands`) 의 DB 판.
	 *   상단 띠: 입점 · 정지 · 정산 정보 미등록 · 검수 대기 보유.
	 *   필터: 상태 칩 + 등급 칩 + 검색(상호 · 담당자 · 이메일 · 코드 · 카테고리).
	 *   표(누적 GMV 내림차순): 브랜드(로고·상호·카테고리·담당자·이메일·추천인) · 등급·누적 GMV ·
	 *      상품(전체 + 노출/대기) · 판매(전체 + LIVE) · 정산 정보 · 🥬 · 자동 제안 ON/OFF · 관리(🥬 지급 · 상품 보기).
	 *   **행 전체가 상세 링크** — 버튼·폼 안 클릭은 제외. 정지·복귀는 상세에서만(되돌리기 비용).
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

<div class="console-head">
	<h2>브랜드</h2>
	<span class="meta">
		입점 {data.counts.all}개 · 정지 {data.counts.suspended} · 정산 정보 미등록 {data.counts.noSettleInfo} · 검수 대기 보유 {data.counts.pendingProduct}
	</span>
	{#if data.counts.pendingProduct}<span class="badge">검수 대기 {data.counts.pendingProduct}</span>{/if}
</div>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<div class="console-filters">
	{#each data.statusChips as c (c.key)}
		<a href={c.href} class={c.key === data.filter ? 'chip on' : 'chip'}>
			{c.label}{#if c.count !== null}<b> {c.count}</b>{/if}
		</a>
	{/each}
</div>
<div class="console-filters">
	{#each data.gradeChips as g (g.key)}
		<a href={g.href} class={(g.key || null) === data.grade ? 'chip on' : 'chip'}>{g.label}<b> {g.count}</b></a>
	{/each}
</div>

<form method="get" action={data.self} class="console-search">
	{#if data.filter !== 'all'}<input type="hidden" name="filter" value={data.filter} />{/if}
	{#if data.grade}<input type="hidden" name="grade" value={data.grade} />{/if}
	<input type="search" name="q" value={data.q} placeholder="상호 · 담당자 · 이메일 · 코드 · 카테고리 검색" aria-label="브랜드 검색" />
	<button type="submit" class="ghost sm">검색</button>
	<span class="meta">{data.q ? `${data.rows.length}건` : `전체 ${data.rows.length}건`}</span>
	{#if data.q}<a href={data.self} class="btn ghost sm">지우기</a>{/if}
</form>

{#if data.rows.length === 0}
	<p class="notice" role="status">{data.q ? `"${data.q}" 에 맞는 브랜드가 없어요.` : '해당하는 브랜드가 없어요.'}</p>
{:else}
	<div class="tblw admin-table">
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
					<tr class="clickable" onclick={rowClick(b)} onkeydown={rowKey(b)} tabindex="0" role="link" aria-label="{b.name} 상세">
						<td data-label="브랜드">
							<span class="admin-brand-cell">
								{#if imageSrc(b.logo_url)}
									<img src={imageSrc(b.logo_url)} alt="" class="admin-brand-logo" />
								{/if}
								<span>
									<a href={detail(b)}><b>{b.name}</b></a>
									{#if b.code}<span class="console-mono meta"> {b.code}</span>{/if}
									{#if !b.active}<StatusChip tone={chip.tone}>{chip.label}</StatusChip>{/if}
									<span class="meta admin-brand-sub">
										{[b.category, b.manager_name, b.email].filter(Boolean).join(' · ') || '—'}{#if b.referrer_name} · 추천: {b.referrer_name}{/if}
									</span>
								</span>
							</span>
						</td>
						<td data-label="등급 · 누적 GMV">
							<GradeBox grade={b.grade} sm />
							<span class="meta admin-brand-sub">{money(b.gmv)}</span>
						</td>
						<td data-label="상품" class="num">
							{b.products_total}
							<span class="meta admin-brand-sub">{productCountLine(b)}</span>
						</td>
						<td data-label="판매" class="num">
							{b.campaigns_total}
							{#if b.campaigns_live}<StatusChip tone="green">LIVE {b.campaigns_live}</StatusChip>{/if}
						</td>
						<td data-label="정산 정보">
							<StatusChip tone={si.tone}>{si.label}</StatusChip>
							{#if b.has_bank_info}<span class="meta admin-brand-sub">사업자 {b.biz_no ?? '—'}</span>{/if}
						</td>
						<td data-label="셀러리" class="num">🥬 {b.celery}</td>
						<td data-label="자동 제안">
							<form method="post" action="?/auto">
								<input type="hidden" name="brand" value={b.code ?? b.id} />
								<input type="hidden" name="on" value={b.auto_propose ? 'false' : 'true'} />
								<button type="submit" class={b.auto_propose ? 'pri sm' : 'ghost sm'}>{autoProposeLabel(b.auto_propose)}</button>
							</form>
						</td>
						<td data-label="관리">
							<div class="admin-row-acts">
								<form method="post" action="?/grant" onsubmit={confirmGrant(b.name)}>
									<input type="hidden" name="brand" value={b.code ?? b.id} />
									<button type="submit" class="ghost sm">🥬 +3 지급</button>
								</form>
								<a href="{data.productsPath}?brand={encodeURIComponent(b.code ?? b.id)}" class="btn ghost sm">상품 보기</a>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.admin-brand-cell {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.admin-brand-logo {
		width: 26px;
		height: 26px;
		border: 1.5px solid var(--color-soft-line);
		flex: none;
	}
	.admin-brand-sub {
		display: block;
		font-size: 11.5px;
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
