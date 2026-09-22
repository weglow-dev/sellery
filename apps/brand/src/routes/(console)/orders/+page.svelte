<script lang="ts">
	/**
	 * 주문 · 발주 · 운송장 — 프로토타입 데모 demo-orders/+page.svelte(발주서 CSV · 송장 일괄 업로드 + 양식 · 최근 주문 표 · 단건 송장 모달 trackOne · 환불) 의 form action 판.
	 *   머리: 필터 칩(전체 · 미발송 · 발송 · 환불) + 캠페인 셀렉트(`?campaign=`) · 합계(주문 수 · 매출 · 미발송 · 환불) · [발주서 CSV] · [운송장 일괄 등록](details — 붙여넣기 textarea 또는 CSV 파일 + 양식 다운로드 → 행별 결과)
	 *   표(`.tblw.console-orders` — 640px 아래는 카드 모드): 주문번호 · 주문일 · 캠페인/인플루언서 · 상품/옵션/수량 · 금액 · 수령인/연락처/주소(발송 목적 전체 표시) · 상태 · 운송장(택배사 + 번호 인라인 `?/ship` · 등록된 행은 조회 링크 + [수정]) · [환불](미발송만 · `?/refund` 사유)
	 * 실패한 단건 송장 제출은 `form`(fail 400 · code 일치 행)으로 값 유지 · 필드 강조. 발송된 주문의 환불은 "교환·반품은 고객 문의로"(§8 결정 — 발송 전만).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { COURIERS } from '@sellery/db/carriers';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const query = $derived.by(() => {
		const p = new URLSearchParams();
		if (data.filter !== 'all') p.set('f', data.filter);
		if (data.campaign) p.set('campaign', data.campaign);
		return p.toString();
	});
	/** 현재 필터 · 캠페인을 유지한 named action (`?f=…&campaign=…&/ship`) */
	const act = (name: string) => (query ? `?${query}&/${name}` : `?/${name}`);
	const shipFail = (code: string) => (form && form.kind === 'ship' && form.code.toLowerCase() === code.toLowerCase() ? form : null);
	const bulk = $derived(form && form.kind === 'bulk' ? form : null);
	const money = (n: number) => `₩${fmtNum(n)}`;
	const addrOf = (s: NonNullable<PageData['rows'][number]['shipping']>) => `(${s.postcode}) ${s.address1}${s.address2 ? ` ${s.address2}` : ''}`;
	const confirmRefund = (e: SubmitEvent, code: string, amount: number) => {
		if (!confirm(`${code.toUpperCase()} · ${money(amount)} 를 전액 환불할까요? 결제가 즉시 취소되며 되돌릴 수 없어요.`)) e.preventDefault();
	};
</script>

<svelte:head>
	<title>주문 · 발주 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>주문 · 발주</h2>
	{#if data.totals.unshipped}<span class="badge">미발송 {data.totals.unshipped}</span>{/if}
	<span class="meta">발주서 다운로드 → 송장 채워서 일괄 등록 · 미발송부터</span>
	<a href={data.csPath} class="btn ghost sm" style="margin-left:auto">고객 문의 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<div class="mini-stats console-totals console-orders-totals">
	<div><span class="ms-l">주문</span><span class="ms-v">{fmtNum(data.totals.count)}건</span><span class="ms-s">{data.selectedCampaign ? data.selectedCampaign.code.toUpperCase() : '전체 캠페인'} · 샘플 제외</span></div>
	<div><span class="ms-l">결제 매출</span><span class="ms-v">{money(data.totals.paid_amount)}</span><span class="ms-s">환불 {money(data.totals.refund_amount)} 제외 전</span></div>
	<div><span class="ms-l">미발송</span><span class="ms-v" class:console-danger={data.totals.unshipped > 0}>{fmtNum(data.totals.unshipped)}건</span><span class="ms-s">발송 {fmtNum(data.totals.shipped)}건</span></div>
	<div><span class="ms-l">환불</span><span class="ms-v">{fmtNum(data.totals.refunded)}건</span><span class="ms-s">고객 신청 + 브랜드 처리</span></div>
</div>

<div class="card static console-orders-tools">
	<form method="get" class="console-orders-pick">
		{#if data.filter !== 'all'}<input type="hidden" name="f" value={data.filter} />{/if}
		<label for="orders-campaign" class="lbl">캠페인</label>
		<select id="orders-campaign" name="campaign" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
			<option value="" selected={!data.campaign}>전체 캠페인</option>
			{#each data.campaignOptions as c (c.code)}<option value={c.code} selected={data.campaign?.toLowerCase() === c.code.toLowerCase()}>{c.label}</option>{/each}
		</select>
		<noscript><button type="submit" class="sm ghost">적용</button></noscript>
	</form>
	<div class="btnrow">
		<a href={data.poHref} class="btn pri sm" download>⬇ 발주서 CSV{data.selectedCampaign ? ` · ${data.selectedCampaign.code.toUpperCase()}` : ''}</a>
		<a href={data.templateHref} class="btn ghost sm" download>양식 다운로드</a>
	</div>
	<p class="meta">발주서는 결제 완료 주문(수취인 · 주소 · 옵션 · 운송장)을 엑셀 호환 CSV 로 내려받아요 — 첫 내보내기 시각이 캠페인에 기록됩니다. 수취인 정보는 배송 목적으로만 쓰세요.</p>
</div>

<details class="card static console-bulk" open={bulk !== null}>
	<summary>⬆ 운송장 일괄 등록 <span class="meta">— 양식(주문번호,택배사,운송장번호)을 채워 붙여넣거나 CSV 파일로</span></summary>
	<form method="post" action={act('shipBulk')} enctype="multipart/form-data" class="console-form">
		<div class="fld {bulk?.message ? 'invalid' : ''}">
			<label for="bulk-csv">붙여넣기</label>
			<textarea id="bulk-csv" name="csv" rows="4" placeholder={'주문번호,택배사,운송장번호\nO2001,CJ대한통운,689012345678\nO2002,한진택배,5123-4567-8901'}>{bulk?.values?.csv ?? ''}</textarea>
			<div class="hint">택배사는 CJ대한통운 · 우체국택배 · 한진택배 · 롯데택배 · 로젠택배 (앞글자만 써도 돼요). 한 번에 500행까지 · 이미 등록된 주문은 정정으로 덮어써요.</div>
		</div>
		<div class="fld">
			<label for="bulk-file">또는 CSV 파일</label>
			<input id="bulk-file" name="file" type="file" accept=".csv,.txt,text/csv,text/plain" />
		</div>
		{#if bulk?.message}<div class="console-err" role="alert">{bulk.message}</div>{/if}
		<div class="btnrow"><button type="submit" class="pri sm">일괄 등록</button></div>
	</form>
	{#if bulk?.summary}
		<p class="notice {bulk.applied ? 'ok' : ''}" role="status">{bulk.summary}</p>
	{/if}
	{#if bulk && ((bulk.results?.length ?? 0) || (bulk.csvErrors?.length ?? 0))}
		<ul class="console-bulk-results">
			{#each bulk.results ?? [] as x (x.order_code)}
				<li class={x.ok ? 'ok' : 'bad'}><b class="console-mono">{x.order_code}</b> <span>{x.text}</span></li>
			{/each}
			{#each bulk.csvErrors ?? [] as e (`${e.line}:${e.message}`)}
				<li class="bad"><b class="console-mono">{e.line ? `${e.line}행` : '전체'}</b> <span>{e.message}</span></li>
			{/each}
		</ul>
	{/if}
</details>

<nav class="cats console-filters" aria-label="주문 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {data.filter === f.key ? 'on' : ''}" aria-current={data.filter === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
	{#if data.campaign}<a href={data.allHref} class="catchip" title="캠페인 필터 해제">✕ {data.campaign.toUpperCase()}</a>{/if}
</nav>

<div class="tblw console-orders">
	<table>
		<thead>
			<tr><th>주문</th><th>캠페인</th><th>상품 · 옵션</th><th class="num">금액</th><th>수령인 · 배송지</th><th>상태</th><th>운송장</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.rows as o (o.code)}
				{@const f = shipFail(o.code)}
				{@const p = o.campaign.product}
				{@const s = o.campaign.seller}
				<tr class="row-{o.state}">
					<td data-l="주문"><b class="console-mono">{o.code.toUpperCase()}</b><small>{md(o.paid_at)} 결제{o.payment_method ? ` · ${o.payment_method}` : ''}</small></td>
					<td data-l="캠페인"><a href={o.campaign.href} class="console-mono">{o.campaign.code.toUpperCase()}</a><small>{s ? `${s.handle} · ${s.name}` : '—'}</small></td>
					<td data-l="상품">
						<span class="console-cell-prod">
							{#if p}<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={22} />{/if}
							<span><b>{p?.name ?? '—'}</b><small>{o.option_name || '기본'} × {o.qty}</small></span>
						</span>
					</td>
					<td class="num" data-l="금액">{money(o.amount)}{#if o.status !== 'PAID' && o.refund_amount}<small>환불 −{money(o.refund_amount)}</small>{/if}</td>
					<td data-l="수령인" class="console-orders-addr">
						{#if o.shipping}
							<b>{o.shipping.recipient}</b> · {o.shipping.phone}<small>{addrOf(o.shipping)}</small>{#if o.shipping.memo}<small>메모: {o.shipping.memo}</small>{/if}
						{:else}
							<b>{o.buyer_name}</b>{#if o.buyer_phone}{' '}· {o.buyer_phone}{/if}<small class="console-danger">배송지 없음 — 시드·수기 주문</small>
						{/if}
					</td>
					<td data-l="상태">
						<StatusChip tone={o.chip.tone}>{o.chip.label}</StatusChip>
						{#if o.state === 'refunded'}<small>{o.refunded_at ? md(o.refunded_at) : ''}{o.refund_actor ? ` · ${o.refund_actor === 'brand' ? '브랜드' : o.refund_actor === 'customer' ? '고객 신청' : '운영팀'}` : ''}{o.refund_reason ? ` · ${o.refund_reason}` : ''}</small>
						{:else if o.state === 'shipped' && o.shipped_at}<small>{md(o.shipped_at)} 발송</small>{/if}
					</td>
					<td data-l="운송장" class="console-orders-ship">
						{#if o.state === 'refunded'}
							—
						{:else if o.state === 'shipped' && !f}
							<span class="console-mono">{o.courier} {o.tracking_no}</span>
							{#if o.trackingUrl}<a href={o.trackingUrl} target="_blank" rel="noopener" class="btn ghost sm">조회 ↗</a>{/if}
							<details class="console-reject console-orders-edit">
								<summary class="btn ghost sm">수정</summary>
								<form method="post" action={act('ship')} class="console-form console-shipform">
									<input type="hidden" name="order_code" value={o.code} />
									<div class="fld"><select name="courier" aria-label="택배사" required>{#each COURIERS as k (k)}<option value={k} selected={o.courier === k}>{k}</option>{/each}</select></div>
									<div class="fld"><input name="tracking_no" value={o.tracking_no ?? ''} placeholder="송장번호" inputmode="numeric" required aria-label="송장번호" /></div>
									<button type="submit" class="pri sm">정정</button>
								</form>
							</details>
						{:else}
							<form method="post" action={act('ship')} class="console-form console-shipform">
								<input type="hidden" name="order_code" value={o.code} />
								<div class="fld {f?.field === 'courier' ? 'invalid' : ''}">
									<select name="courier" aria-label="택배사" required>
										<option value="" selected={!(f?.values.courier ?? o.courier)} disabled>택배사</option>
										{#each COURIERS as k (k)}<option value={k} selected={(f?.values.courier ?? o.courier) === k}>{k}</option>{/each}
									</select>
								</div>
								<div class="fld {f?.field === 'tracking_no' ? 'invalid' : ''}">
									<input name="tracking_no" value={f?.values.tracking_no ?? o.tracking_no ?? ''} placeholder="송장번호" inputmode="numeric" required aria-label="송장번호" />
								</div>
								<button type="submit" class="pri sm">{o.state === 'shipped' ? '정정' : '등록'}</button>
								{#if f}<div class="console-err" role="alert">{f.message}</div>{/if}
							</form>
						{/if}
					</td>
					<td data-l="환불" class="console-orders-refund">
						{#if o.refundable}
							<details class="console-reject">
								<summary class="btn danger sm">환불</summary>
								<form method="post" action={act('refund')} class="console-form console-reject-form" onsubmit={(e) => confirmRefund(e, o.code, o.amount)}>
									<input type="hidden" name="order_code" value={o.code} />
									<select name="reason" aria-label="환불 사유" required>
										{#each data.refundReasons as rr (rr)}<option value={rr}>{rr}</option>{/each}
									</select>
									<textarea name="reason_text" rows="2" maxlength={data.refundReasonMax} placeholder="메모 (선택 · 고객 결제 취소 사유에 함께 남아요)"></textarea>
									<button type="submit" class="danger sm">전액 환불 확정</button>
								</form>
							</details>
						{:else if o.state === 'shipped'}
							<small class="meta">교환·반품은 고객 문의로</small>
						{:else if o.state === 'unshipped'}
							<small class="meta">정산 완료 판매</small>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="8" class="empty" style="padding:28px;text-align:center">
					{#if data.filter !== 'all' || data.campaign}조건에 맞는 주문이 없어요{:else}주문이 없습니다<div class="meta" style="margin-top:8px">판매가 시작되면 고객 주문이 여기에 쌓여요 — <a href={data.campaignsPath}>내 캠페인 →</a></div>{/if}
				</td></tr>
			{/each}
		</tbody>
	</table>
</div>
{#if data.rows.length >= 500}<p class="meta" style="margin:6px 4px">최근 500건까지 표시돼요 — 캠페인이나 필터로 좁혀주세요.</p>{/if}
