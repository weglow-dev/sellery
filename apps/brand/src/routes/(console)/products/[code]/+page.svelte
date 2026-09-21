<script lang="ts">
	/**
	 * 상품 수정 — 머리(아이콘 · 이름 · 코드 · 상태 칩 · 반려 사유 · 잠금 안내) + `../ProductForm.svelte`. 실패한 제출은 `form`(fail 400) 값으로 다시 그린다.
	 * 반려 상품은 "수정 후 저장하면 다시 검수" 안내, 잠긴 상품은 폼 위 잠금 notice(ProductForm) — 원문은 데모 saveProduct 토스트.
	 */
	import { md } from '@sellery/db/dates';
	import { fmtNum } from '@sellery/db/campaign';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import ProductForm from '../ProductForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.product);
</script>

<svelte:head>
	<title>{p.name} 수정 — 셀러리 파트너</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 상품 관리</a>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : ''}`} role="status">{data.msg.text}</p>
{/if}

<section class="card static console-det">
	<ProductIcon thumbUrl={form?.thumb_url ?? p.thumb_url} emoji={p.emoji} size={64} />
	<div class="grow">
		<div class="t">{p.name} <small>· {p.code.toUpperCase()}</small></div>
		<div class="meta">
			<StatusChip tone={p.chip.tone}>{p.chip.label}</StatusChip>
			{#if p.status === 'rejected'}
				<span class="console-danger">사유: {p.reject_reason || '—'} — 수정 후 저장하면 다시 검수를 요청합니다</span>
			{:else if p.status === 'pending'}
				검수 대기 — 운영팀 승인 뒤 인플루언서에게 노출됩니다
			{:else if p.status === 'paused'}
				노출 중단 — 새 샘플 요청만 막히고 진행 중 판매는 유지됩니다
			{:else}
				노출 중 — 판매가·수수료율을 바꾸면 재검수 대기로 전환됩니다
			{/if}
		</div>
		{#if p.schedules.length}
			<div class="meta">확정·진행 중 판매 일정 {#each p.schedules as s (s.code)}<span class="console-mono">{s.start_date ? md(s.start_date) : '—'}–{s.end_date ? md(s.end_date) : '—'} · {fmtNum(s.qty)}개</span>{/each}</div>
		{/if}
	</div>
</section>

<!-- 3단계(0016): 인플루언서 직접 제안 — 노출 중 상품만 (프로토타입 갤러리 → inviteModal 의 진입점을 상품 쪽에 둔다) -->
<section class="card static console-invite-entry" style="margin-top:14px">
	<div class="grow">
		<b>인플루언서 직접 제안</b>
		<div class="meta" style="margin-top:4px">
			{#if p.status === 'listed'}
				기다리지 말고 먼저 제안해보세요 — 수락하면 샘플 발송 단계부터 바로 시작돼요(무상 · 인플루언서 월 한도 미차감). 플래티넘 이하 공개 인플루언서에게 보낼 수 있어요.
			{:else}
				노출 중인 상품만 제안할 수 있어요 — 지금은 {p.chip.label} 상태예요.
			{/if}
		</div>
	</div>
	{#if p.status === 'listed'}
		<a href={data.inviteHref} class="btn pri sm">인플루언서 초대 →</a>
	{:else}
		<span class="btn ghost sm" aria-disabled="true">노출 후 가능</span>
	{/if}
</section>

<section class="card static" style="margin-top:14px">
	<ProductForm
		values={form?.values ?? data.values}
		thumbUrl={form ? form.thumb_url : p.thumb_url}
		imageUrls={form ? form.image_urls : p.image_urls}
		categories={data.categories}
		locked={p.locked}
		allocated={p.allocated}
		exclusiveSellerLocked={p.exclusive_seller_locked}
		isNew={false}
		field={form?.field ?? null}
		message={form?.message ?? null}
		imageAccept={data.imageAccept}
		imageMaxMb={data.imageMaxMb}
		listPath={data.listPath}
	/>
</section>
