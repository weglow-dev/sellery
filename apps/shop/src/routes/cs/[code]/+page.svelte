<script lang="ts">
	/**
	 * 고객 문의 스레드 — 머리(상품 · 브랜드 · 유형 · 상태 칩) · 주문 요약(매칭됐을 때 · 운송장 조회) · 말풍선(내 글은 오른쪽 `mine` · 브랜드/운영팀은 왼쪽) · 추가 문의 폼(`?/reply`).
	 * CLOSED 는 폼 대신 "처리 종료" 안내 + 새 문의 링크. "브랜드가 답변하면 여기서 확인" 안내 — 알림 채널(알림톡·메일)은 없다(§8).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { CS_BODY_MAX, csSenderLabel } from '@sellery/db/cs/cs-rules';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const c = $derived(data.conversation);
	const p = $derived(c.campaign.product);
	const closed = $derived(c.status === 'CLOSED');
	const who = (sender: 'customer' | 'brand' | 'admin') => (sender === 'customer' ? `${c.buyer_name} (나)` : csSenderLabel(sender, data.brandName));
	const fmtTime = (iso: string) => `${md(iso)} ${new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}`;
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		e.preventDefault();
		(e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}
</script>

<svelte:head>
	<title>문의 {c.code.toUpperCase()} — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="cs-page">
	<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 3px 12px">
		{#if data.ordersHref}<a href={data.ordersHref} class="btn ghost sm">← 내 주문</a>{/if}
		{#if data.storeUrl}<a href={data.storeUrl} class="btn ghost sm">판매 페이지</a>{/if}
	</div>
	<h2 class="pg">문의 <small>{c.code.toUpperCase()} · {data.brandName} 가 답변해요</small></h2>

	{#if data.msg}
		<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
	{/if}

	<div class="card static">
		<div class="cs-head">
			{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={44} />{/if}
			<div class="grow">
				<div class="nm">{p?.name ?? '문의'} <span class="chip">{c.type}</span></div>
				<p class="meta">{data.brandName}{#if c.campaign.seller}{' '}· {c.campaign.seller.name}님의 판매{/if} · 접수 {fmtTime(c.created_at)}{#if c.order_code}{' '}· 주문 <span style="font-family:var(--font-mono)">{c.order_code.toUpperCase()}</span>{/if}</p>
			</div>
			<StatusChip tone={data.chip.tone}>{data.chip.label}</StatusChip>
		</div>
		{#if c.order}
			<div class="meta" style="margin:10px 0 0;font-size:12.5px">
				주문 {c.order.code.toUpperCase()} · {c.order.option_name || '기본'} × {c.order.qty} · ₩{fmtNum(c.order.amount)}
				{#if c.order.tracking_no}{' '}· {c.order.courier ?? ''} {c.order.tracking_no}{#if data.orderTrackingUrl}{' '}<a href={data.orderTrackingUrl} target="_blank" rel="noopener" style="text-decoration:underline">배송 조회 ↗</a>{/if}{/if}
			</div>
		{/if}
	</div>

	<section class="card static console-thread cs-thread" aria-label="문의 스레드" id="thread">
		<div class="msgs">
			{#each data.messages as m (m.id)}
				<div class="msg {m.sender === 'customer' ? 'mine' : m.sender === 'brand' ? 'customer' : 'admin'}">
					<div class="who">{who(m.sender)}</div>
					{m.body}
					<div class="tm">{fmtTime(m.created_at)}</div>
				</div>
			{:else}
				<div class="sysline">메시지가 없습니다</div>
			{/each}
			{#if c.status === 'OPEN'}<div class="sysline">브랜드가 답변하면 여기서 확인할 수 있어요</div>{/if}
			{#if closed}<div class="sysline">처리 종료{c.closed_at ? ` · ${fmtTime(c.closed_at)}` : ''}</div>{/if}
		</div>
		{#if closed}
			<div class="composer">처리 종료된 문의예요 — 더 궁금한 점은 <a href={`/cs/new?campaign=${encodeURIComponent(c.campaign.code)}${c.order_code ? `&order=${encodeURIComponent(c.order_code)}` : ''}`} style="text-decoration:underline">새 문의</a>로 남겨주세요.</div>
		{:else}
			<form method="post" action="?/reply" class="composer console-composer">
				<label class="as" for="cs-reply">추가 문의</label>
				<div class="row">
					<textarea id="cs-reply" name="body" rows="2" maxlength={CS_BODY_MAX} placeholder="추가로 궁금한 점… (Enter 전송 · Shift+Enter 줄바꿈)" required aria-invalid={form?.message ? true : undefined} onkeydown={onKeydown}>{form?.values?.body ?? ''}</textarea>
					<button type="submit" class="pri sm">보내기</button>
				</div>
				{#if form?.message}<div class="console-err" role="alert">{form.message}</div>{/if}
				<div class="note">결제·정산 문제는 셀러리 운영팀이 함께 확인해요. 카드 정보 등 민감한 정보는 적지 마세요.</div>
			</form>
		{/if}
	</section>
</div>
