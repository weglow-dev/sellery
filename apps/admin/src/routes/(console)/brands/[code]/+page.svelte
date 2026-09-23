<script lang="ts">
	/**
	 * 브랜드 상세 — 입점 정보 · 실적 · 운영 액션(정지/복귀 · 자동 제안 · 🥬 지급).
	 * UI 는 인플루언서 상세 · 주문 상세와 같은 console-det / kv / actions 톤.
	 * 계좌 원문은 표시하지 않는다 — 등록 여부와 사업자번호만(계획서 M6).
	 */
	import { SUSPEND_BRAND_NOTE, autoProposeLabel, brandStatusChip, productCountLine, settleInfoChip } from '@sellery/db/admin/brand-rules';
	import { fmtNum, imageSrc } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { GradeBox, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const b = $derived(data.brand);
	const chip = $derived(brandStatusChip(b));
	const si = $derived(settleInfoChip(b));
	const money = (n: number) => `₩${fmtNum(n)}`;
	const ask = (msg: string) => (e: SubmitEvent) => {
		if (!confirm(msg)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>{b.name} — 브랜드 · 셀러리 관리자</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm brand-back">← 브랜드</a>

{#if data.msg}
	<p class={`notice ${data.msgTone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.msg}</p>
{/if}

<section class="card static console-det">
	{#if imageSrc(b.logo_url)}
		<img src={imageSrc(b.logo_url)} alt="" class="brand-det-logo" />
	{/if}
	<div class="grow">
		<div class="t">
			{b.name}
			{#if b.code}<small>· {b.code}</small>{/if}
		</div>
		<div class="meta">
			{[b.category, b.manager_name, b.email].filter(Boolean).join(' · ') || '—'}
			{#if b.referrer_name} · 추천: {b.referrer_name}{/if}
		</div>
		<div class="brand-det-tags">
			<GradeBox grade={b.grade} sm />
			<span class="meta">누적 GMV {money(b.gmv)} · 🥬 {b.celery}</span>
		</div>
	</div>
	<div class="admin-det-status">
		<StatusChip tone={chip.tone}>{chip.label}</StatusChip>
		<StatusChip tone={si.tone}>{si.label}</StatusChip>
		{#if b.products_pending}
			<StatusChip tone="amber">검수 대기 {b.products_pending}</StatusChip>
		{/if}
	</div>
</section>

<div class="mini-stats admin-strip brand-det-strip">
	<div>
		<span class="ms-l">누적 GMV</span>
		<span class="ms-v">{money(b.gmv)}</span>
		<span class="ms-s">등급 산정 근거</span>
	</div>
	<div>
		<span class="ms-l">상품</span>
		<span class="ms-v" style={b.products_pending ? 'color:var(--color-danger)' : ''}>{b.products_total}</span>
		<span class="ms-s">{productCountLine(b)}</span>
	</div>
	<div>
		<span class="ms-l">판매</span>
		<span class="ms-v">{b.campaigns_total}</span>
		<span class="ms-s">{b.campaigns_live ? `LIVE ${b.campaigns_live}` : '진행 중 없음'}</span>
	</div>
	<div>
		<span class="ms-l">셀러리</span>
		<span class="ms-v">🥬 {b.celery}</span>
		<span class="ms-s">관리자 지급 가능</span>
	</div>
</div>

<div class="console-det-body admin-det-body">
	<div>
		<section class="card static">
			<h4 class="admin-h4">입점 정보</h4>
			<dl class="console-kv">
				<dt>등급</dt>
				<dd>
					<GradeBox grade={b.grade} sm />
					<span class="meta"> 누적 GMV 로 재계산 — 여기서 바꾸지 않습니다</span>
				</dd>
				<dt>카테고리</dt>
				<dd>{b.category ?? '—'}</dd>
				<dt>담당자</dt>
				<dd>{[b.manager_name, b.manager_phone, b.email].filter(Boolean).join(' · ') || '—'}</dd>
				<dt>사업자번호</dt>
				<dd>{b.biz_no ?? '—'}{#if b.mail_order_no} · 통신판매 {b.mail_order_no}{/if}</dd>
				<dt>정산 정보</dt>
				<dd>
					<StatusChip tone={si.tone}>{si.label}</StatusChip>
					<span class="meta">
						계좌 {b.has_bank_info ? '등록' : '미등록'} · 세금계산서 정보 {b.has_tax_info ? '등록' : '미등록'} — 계좌
						원문은 이체 파일에서만 볼 수 있습니다
					</span>
				</dd>
				<dt>발주</dt>
				<dd>{b.po_enabled ? `이메일 발주 사용 · ${b.po_email ?? '주소 미등록'}` : '사용 안 함'}</dd>
				{#if b.referrer_name}
					<dt>추천</dt>
					<dd>{b.referrer_name}</dd>
				{/if}
				<dt>입점일</dt>
				<dd>{md(b.created_at)}</dd>
			</dl>
			<div class="btnrow brand-det-foot">
				<a href="{data.productsPath}?brand={encodeURIComponent(b.code ?? b.id)}" class="btn ghost sm">상품 보기 →</a>
			</div>
		</section>
	</div>

	<div class="console-actions">
		<div class="card static">
			<h4>콘솔 입장</h4>
			<p class="hint">
				{#if b.active}
					정지하면 다음 요청부터 브랜드 콘솔에 들어올 수 없습니다. {SUSPEND_BRAND_NOTE}
				{:else}
					정지 상태입니다. 풀면 바로 콘솔에 들어올 수 있습니다.
				{/if}
			</p>
			{#if b.active}
				<form method="post" action="?/active" class="brand-suspend" onsubmit={ask(`${b.name} 을 정지할까요? ${SUSPEND_BRAND_NOTE}`)}>
					<input type="hidden" name="active" value="false" />
					<input type="text" name="reason" placeholder="사유 (Slack 알림에만 · 저장 안 됨)" maxlength="200" aria-label="정지 사유" />
					<button type="submit" class="danger sm">정지</button>
				</form>
			{:else}
				<form method="post" action="?/active">
					<input type="hidden" name="active" value="true" />
					<button type="submit" class="pri sm">정지 해제</button>
				</form>
			{/if}
		</div>

		<div class="card static">
			<h4>자동 제안</h4>
			<p class="hint">켜면 등급·카테고리가 맞는 인플루언서에게 시스템이 판매를 제안합니다. 다이아 이상에게 제안할 때는 🥬 가 소모됩니다.</p>
			<form method="post" action="?/auto">
				<input type="hidden" name="on" value={b.auto_propose ? 'false' : 'true'} />
				<button type="submit" class={b.auto_propose ? 'pri sm' : 'ghost sm'}>{autoProposeLabel(b.auto_propose)}</button>
			</form>
		</div>

		<div class="card static">
			<h4>🥬 관리자 지급</h4>
			<p class="hint">이벤트·보상 지급. 누를 때마다 원장(<code>admin_grant</code>)에 적재되며 되돌리려면 운영 조정이 필요합니다.</p>
			<form method="post" action="?/grant" onsubmit={ask(`${b.name} 에게 🥬 를 지급할까요? 되돌리려면 운영 조정이 필요합니다.`)}>
				<button type="submit" class="ghost sm">🥬 +3 지급</button>
			</form>
		</div>
	</div>
</div>

<style>
	.brand-back {
		margin: 0 3px 12px;
	}
	.brand-det-logo {
		width: 52px;
		height: 52px;
		border: 1.5px solid var(--color-soft-line);
		flex: none;
		object-fit: cover;
	}
	.brand-det-tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
	.brand-det-strip {
		margin: 12px 3px 4px;
	}
	.brand-det-foot {
		margin-top: 14px;
	}
	.brand-suspend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		margin: 0;
	}
	.brand-suspend input[type='text'] {
		flex: 1 1 160px;
		min-width: 0;
	}
	.console-actions form {
		margin: 0;
	}
</style>
