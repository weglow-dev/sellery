<script lang="ts">
	/**
	 * 상품 관리 — 프로토타입 데모 products/+page.svelte(표) 1:1 문구 · 행 카드로 (375px 가로 스크롤 없음).
	 * 행 = 상품 아이콘 · 이름 · 설명 · 판매가(소비자가 취소선) · 총 수수료율(플랫폼 10 포함) · 샘플(무상 기준 등급 · 구매가 · 환급) · 재고(배정 · 잔여) · 독점권 · 상태 칩(반려 사유) · 판매 일정.
	 * 액션: [수정 · 재검수] → `/products/<code>` · [노출 중단/재개] `?/setListing`(pending · rejected 는 사유 안내) · [삭제] `?/delete`(confirm · 진행 이력이 있으면 서버가 막는다) · [+ 새 상품 등록].
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { GradeBox, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** 데모 samplePrice: 지정가 또는 (판매가 − 내 수수료) 10원 절사 */
	const buyPrice = (p: PageData['products'][number]) => (p.sample_buy_mode === 'fixed' && p.sample_fixed_price ? p.sample_fixed_price : Math.round((p.sale_price * (1 - p.commission_rate)) / 10) * 10);
	const confirmDelete = (e: SubmitEvent, name: string) => {
		if (!confirm(`'${name}' 을(를) 삭제할까요? 진행 이력이 있는 상품은 삭제되지 않고 노출 중단만 할 수 있어요.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>상품 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>상품 관리</h2>
	<span class="meta">판매가·수수료율은 등록 시 책정, 판매 진행 중 변경 불가</span>
	<a href={data.newPath} class="btn pri sm" style="margin-left:auto">+ 새 상품 등록</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<div class="listcard console-rows console-prodlist">
	{#each data.products as p (p.code ?? p.name)}
		<div class="rowitem">
			<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={44} />
			<div class="grow">
				<div class="nm">
					{#if p.href}<a href={p.href}>{p.name}</a>{:else}{p.name}{/if}
					{#if p.boosted}<span class="st blue" style="animation:none">부스트</span>{/if}
					<StatusChip tone={p.chip.tone} title={p.reject_reason ?? undefined}>{p.chip.label}</StatusChip>
					{#if p.locked}<span class="chip auto" title="진행 중·확정된 판매가 있어 판매가·수수료율·옵션 잠금">🔒 잠금</span>{/if}
				</div>
				{#if p.description}<div class="sub">{p.description}</div>{/if}
				{#if p.status === 'rejected'}
					<div class="sub console-danger">{p.reject_reason || '반려'} — 수정 후 저장하면 다시 검수를 요청합니다</div>
				{:else if p.status === 'pending'}
					<div class="sub">검수 대기 — 운영팀 승인 뒤 인플루언서에게 노출됩니다</div>
				{/if}
				<div class="console-prodmeta">
					<span><b>₩{fmtNum(p.sale_price)}</b> <s>₩{fmtNum(p.consumer_price)}</s></span>
					<span>수수료 <b>{p.total_rate}%</b> <small>(인플루언서 {(p.commission_rate * 100).toFixed(0)} + 플랫폼 10)</small></span>
					<span>샘플 {p.sample_text || '—'} <small>· {p.sample_free_grade ?? '실버'}↑ 무상 · 구매 ₩{fmtNum(buyPrice(p))}{p.sample_refund ? ' · 환급' : ''}</small></span>
					<span>재고 <b>{fmtNum(p.stock)}</b> <small>· 배정 {fmtNum(p.allocated)} · 잔여 {fmtNum(p.left)}</small></span>
					<span>독점권 {#if p.exclusive_grade}<GradeBox grade={p.exclusive_grade} sm /> 이상{#if p.exclusive_seller_id}{' '}<span class="st green" style="animation:none">확정</span>{/if}{:else}<small>—</small>{/if}</span>
					<span>판매 일정 {#each p.schedules as s (s.code)}<small class="console-mono">{s.start_date ? md(s.start_date) : '—'}–{s.end_date ? md(s.end_date) : '—'} · {fmtNum(s.qty)}개</small>{:else}<small>—</small>{/each}</span>
				</div>
			</div>
			<div class="rowacts">
				{#if p.href}<a href={p.href} class="btn pri sm">{p.status === 'rejected' ? '수정 · 재검수' : '수정'}</a>{/if}
				{#if p.code && (p.status === 'listed' || p.status === 'paused')}
					<form method="post" action="?/setListing">
						<input type="hidden" name="code" value={p.code} />
						<input type="hidden" name="listed" value={p.status === 'listed' ? '0' : '1'} />
						<button type="submit" class="sm ghost">{p.status === 'listed' ? '노출 중단' : '재개'}</button>
					</form>
				{:else}
					<span class="btn ghost sm" aria-disabled="true" title="검수가 끝나기 전에는 노출을 바꿀 수 없어요">노출 —</span>
				{/if}
				{#if p.code}
					<form method="post" action="?/delete" onsubmit={(e) => confirmDelete(e, p.name)}>
						<input type="hidden" name="code" value={p.code} />
						<button type="submit" class="sm ghost" disabled={p.active_campaigns > 0} title={p.active_campaigns > 0 ? '진행 이력이 있는 상품은 삭제할 수 없어요 — 노출 중단을 사용해주세요' : '삭제'}>삭제</button>
					</form>
				{/if}
			</div>
		</div>
	{:else}
		<div class="empty">
			등록된 상품이 없습니다 — 첫 상품을 올리고 인플루언서를 만나보세요
			<div style="margin-top:12px"><a href={data.newPath} class="btn pri sm">+ 새 상품 등록</a></div>
		</div>
	{/each}
</div>
<p class="meta" style="margin:10px 3px 0;font-size:12px">판매가·수수료율은 진행 중인 판매가 있으면 변경할 수 없습니다(신뢰 보호). 노출 중단 시 새 샘플 요청만 막히고 진행 중 판매는 유지됩니다. 진행 이력이 있는 상품은 삭제 대신 노출 중단을 사용해주세요.</p>
