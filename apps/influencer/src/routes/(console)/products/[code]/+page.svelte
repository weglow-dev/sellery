<script lang="ts">
	/**
	 * 상품 상세 — 프로토타입 productDetailModal(js/20-seller.js) 을 페이지로 + 샘플 섹션(sampleBuyModal 의 금액 표 · reqSample 의 배송지 입력).
	 * 익명 실적 표(인플루언서별 팔로워·참여율·매출 + 데이터패스 마스킹)는 다음 단계 — 지금은 집계 두 개(캠페인 수 · 확정 판매 수량)만.
	 * 실적 표(0039): 캠페인별 팔로워·참여율·기간·확정 매출 — **인플루언서 익명**. 매출 데이터 확인권(🥬 2)이
	 *   없으면 첫 행과 내 캠페인만 열리고 나머지는 `blurrow` + ● 자리표시자다(값은 서버가 보내지 않는다).
	 *   구매는 샵(`/shop`)에서 — 영구·계정 단위라 상품마다 사지 않는다.
	 * 독점권(0025): 오퍼가 걸린 상품이면 `data.exclusive.button` 으로 [독점권 신청] — 자격 판정은 DB, 문구는 `exclusiveButton`.
	 *   신청 뒤 `?msg=exclusive` 로 돌아온다(대기 상태 표시). 승인은 브랜드 콘솔 `/brand/requests`.
	 * 샘플 섹션은 `quote.mode`: free(배송지 폼 → ?/requestFree) · buy(금액 표 + [샘플 구매 ₩N] → /pay/new?product= · 🥬 사용 선택은 결제 화면) · locked(독점 안내) · active(캠페인 링크) · unlisted.
	 * 실패한 제출은 `form`(fail 400) 으로 돌아온다 — 입력값 유지 · 실패 필드 강조 · 문구는 REQUEST_FREE_SAMPLE_MESSAGES / notFreeMessage 원문.
	 */
	import { GRADES, SAMPLE_CEL_WON } from '@sellery/core/constants';
	import { discountPct, fmtNum, imageSrc } from '@sellery/db/campaign';
	import { BUY_COMING_SOON, BUY_REASON_TITLES, campaignChip } from '@sellery/db/partner/sample-rules';
	import { ProductIcon, ShippingFields, StatusChip } from '@sellery/ui/site';
	import { page } from '$app/state';
	import {
		PERFORMANCE_EMPTY,
		PERFORMANCE_ME,
		PERFORMANCE_TITLE_SUB,
		dataPassCta,
		lockedNote,
		periodLabel
	} from '@sellery/db/partner/performance-rules';
	import { EXCLUSIVE_MESSAGES } from '@sellery/db/partner/exclusive-rules';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.product);
	const q = $derived(data.quote);
	const b = $derived(data.button);
	const disc = $derived(discountPct(p.consumer_price, p.sale_price));
	const excl = $derived(data.exclusive);
	const perf = $derived(data.perf);
	/** 신청 직후 303 으로 돌아온 안내 (`?msg=exclusive` · `exclusiveAlready`). */
	const exclMsg = $derived(
		page.url.searchParams.get('msg') === 'exclusive'
			? EXCLUSIVE_MESSAGES.requested
			: page.url.searchParams.get('msg') === 'exclusiveAlready'
				? EXCLUSIVE_MESSAGES.already
				: null
	);
	const topBonus = GRADES[0]?.bonus ?? 3;
	const pct = (r: number) => (r * 100).toFixed(0);
	const logo = $derived(imageSrc(p.brand.logo_url));
	// 🥬 최대 분할 — 잔액과 무관 (sampleLine 과 같은 규칙)
	const celWon = $derived(q && q.cel_won > 0 ? q.cel_won : SAMPLE_CEL_WON);
	const price = $derived(q?.price ?? 0);
	const celMax = $derived(Math.floor(price / celWon));
	const cashRest = $derived(price - celMax * celWon);
	const why = $derived(q?.reason && q.reason in BUY_REASON_TITLES ? BUY_REASON_TITLES[q.reason as keyof typeof BUY_REASON_TITLES] : null);
	const shippingValue = $derived(form?.values ?? data.shipping);
</script>

<svelte:head>
	<title>{p.name} — 셀러리 파트너</title>
</svelte:head>

<a href={data.listPath} class="btn ghost sm" style="margin:0 3px 12px">← 상품 갤러리</a>

<section class="card static console-det">
	<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={84} />
	<div class="grow">
		<div class="t">{p.name} <small>{p.code.toUpperCase()}</small></div>
		<div class="meta">
			{#if logo}<img src={logo} alt="" class="brandlogo lg" />{/if}
			<span class="brandname">{p.brand.name}</span>
			· {p.category}
		</div>
		<div class="pricegrid">
			<div><span class="pl">셀러 판매가</span><span class="gp">₩{fmtNum(p.sale_price)}</span>{#if disc !== null}<span class="disc">-{disc}%</span>{/if}</div>
			<div><span class="pl">브랜드 시중가</span><span class="cp">₩{fmtNum(p.consumer_price)}</span></div>
		</div>
		<div class="meta">
			수수료 <b>{pct(p.commission_rate)}~{(p.commission_rate * 100 + topBonus).toFixed(0)}%</b> (등급 보너스 포함) · 건당 예상 수수료 ₩{fmtNum(Math.round(p.sale_price * p.commission_rate))}{#if p.sample_text}{' '}· 샘플 {p.sample_text}{/if}
		</div>
		{#if p.description}<p class="meta" style="margin-top:8px">{p.description}</p>{/if}
	</div>
</section>

{#if data.status?.rule}
	<div class="notice samplebox"><div class="rule">🎁 {data.status.rule}</div></div>
{/if}

{#if p.exclusive_label}
	<div class="exclbox">
		<div class="lbl-sm">👑 브랜드 독점권 오퍼</div>
		<p><b>{p.exclusive_label}</b> — <b>{p.exclusive_grade ?? '플래티넘'}</b> 등급 이상 인플루언서에게 드립니다.</p>
		{#if exclMsg}
			<p class="excl-msg" role="status">{exclMsg}</p>
		{/if}
		{#if excl}
			{#if excl.button.enabled}
				<form method="POST" action="?/requestExclusive">
					<button class="pri sm" type="submit" title={excl.button.hint}>{excl.button.label}</button>
				</form>
			{:else}
				<p class="excl-state" data-kind={excl.button.kind}><b>{excl.button.label}</b></p>
			{/if}
			{#if excl.button.hint}
				<p class="meta" style="font-size:12px">{excl.button.hint}</p>
			{/if}
		{:else if q?.exclusive_locked}
			<!-- 오퍼 조회를 건너뛴 경우(상품이 내려갔다 등) — 견적의 잠금 플래그로 안내 -->
			<p style="font-size:12.5px"><b>독점 인플루언서 확정됨</b> — 이 상품의 샘플 요청은 제한됩니다.</p>
		{/if}
	</div>
{/if}

<!-- 상품별 익명 실적 표(0039) — 확인권이 없으면 첫 행과 내 캠페인만 지표가 온다.
     **잠긴 행은 값이 아예 없다**(서버가 null) — 블러는 "잠겨 있다" 를 알리는 표시일 뿐이다. -->
<div class="sec" style="margin-top:20px">
	이 상품의 판매 실적 <span class="console-sec-sub">— {PERFORMANCE_TITLE_SUB}</span>
</div>
<section class="card static">
	{#if data.performance.campaigns > 0}
		<div class="mini-stats" style="margin:0">
			<div><span class="ms-l">진행된 캠페인</span><span class="ms-v">{fmtNum(data.performance.campaigns)}건</span></div>
			<div><span class="ms-l">확정 판매 수량</span><span class="ms-v">{fmtNum(data.performance.sold_qty)}개</span></div>
		</div>
		{#if perf && perf.rows.length}
			<div class="tblw perf-tbl" style="margin-top:12px">
				<table>
					<thead>
						<tr>
							<th class="num">팔로워</th><th class="num">좋아요</th><th class="num">참여율</th>
							<th class="num">기간</th><th class="num">확정 매출</th><th>상태</th>
						</tr>
					</thead>
					<tbody>
						{#each perf.rows as r (r.rank)}
							<tr class:blurrow={!r.open} class:merow={r.isMe}>
								<td class="num" data-l="팔로워">{r.open ? fmtNum(r.followers ?? 0) : '●●●,●●●'}</td>
								<td class="num" data-l="좋아요">{r.open ? fmtNum(r.likesAvg ?? 0) : '●,●●●'}</td>
								<td class="num" data-l="참여율">{r.open && r.engagement !== null ? `${r.engagement}%` : '●.●%'}</td>
								<td class="num" data-l="기간">{r.open ? periodLabel(r) : '●/● – ●/●'}</td>
								<td class="num" data-l="확정 매출">
									{#if r.open}<b>₩{fmtNum(r.net ?? 0)}</b>{:else}₩●,●●●,●●●{/if}
								</td>
								<td data-l="상태">
									<StatusChip tone={campaignChip(r.status).tone}>{campaignChip(r.status).label}</StatusChip>
									{#if r.isMe}<span class="mebadge">{PERFORMANCE_ME}</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !perf.hasPass && perf.locked > 0}
				<p class="meta" style="margin-top:10px">{lockedNote(perf)}</p>
				<div class="btnrow" style="margin-top:8px">
					<a href={data.shopPath} class="btn pri sm">{dataPassCta(perf)}</a>
				</div>
			{:else if perf.hasPass}
				<p class="meta" style="margin-top:10px">매출 데이터 확인권 보유 — 전체 실적이 열려 있어요.</p>
			{/if}
		{/if}
	{:else}
		<div class="empty" style="padding:18px">{PERFORMANCE_EMPTY}</div>
	{/if}
</section>

{#if p.image_urls.length}
	<div class="sec" style="margin-top:20px">상세페이지 이미지</div>
	<div style="margin:0 4px">
		{#each p.image_urls as u (u)}
			{@const src = imageSrc(u)}
			{#if src}<img {src} alt="" class="detail" loading="lazy" style="width:100%;display:block;margin-bottom:8px;box-shadow:var(--shadow-frame-soft)" />{/if}
		{/each}
	</div>
{/if}

<div class="sec" id="sample" style="margin-top:20px">샘플 {b.kind === 'free' ? '요청' : b.kind === 'buy' ? '구매' : ''}</div>

{#if form?.message}
	<p class="notice danger" role="alert">
		{form.message}{#if form.campaignCode}
			<a href={`${data.campaignsPath}/${encodeURIComponent(form.campaignCode)}`} style="text-decoration:underline;margin-left:6px">캠페인 보기 →</a>{/if}
	</p>
{/if}

{#if b.kind === 'free'}
	<section class="card static console-form">
		<div class="lbl-sm">무상 샘플 요청</div>
		<!-- 어떤 상품을 요청하는지 폼 맨 위에 보인다 (대표 QA 2026-10-08 — 모바일에서 상품 정보가 화면 밖으로 밀려 안 보임) -->
		<div class="sample-target">
			<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={56} />
			<div class="grow">
				<div class="nm">{p.name}</div>
				<div class="meta">{p.brand.name}{#if data.status?.rule}{' '}· 🎁 {data.status.rule}{/if}</div>
			</div>
		</div>
		<div class="lbl-sm" style="margin-top:12px">배송지</div>
		<p class="meta" style="margin:6px 0 12px">
			브랜드가 승인하면 이 주소로 샘플이 발송돼요. 무상 샘플은 요청할 때마다 <b>이달 무상 한도에서 1회</b>가 줄어요{#if data.quotaText}{' '}({data.quotaText}){/if}. <b>같은 상품은 한 번만</b> 무상으로 받을 수 있고, 두 번째부터는 샘플 구매로 진행돼요. 배송지는 <a href={data.myPath} style="text-decoration:underline">내 정보</a> 에 기본값으로 저장돼요.
		</p>
		<form method="post" action="?/requestFree">
			<ShippingFields value={shippingValue} invalid={form?.field ?? null} idPrefix="sample" />
			<div class="btnrow" style="justify-content:flex-end;margin-top:6px">
				<a href={data.listPath} class="btn ghost sm">취소</a>
				<button type="submit" class="pri">{b.label}</button>
			</div>
		</form>
	</section>
{:else if b.kind === 'buy'}
	<section class="card static">
		<div class="lbl-sm">샘플 구매{why ? ` — ${why}` : ''}</div>
		<p class="meta" style="margin:6px 0 10px">
			무상 기준 <b>{q?.free_grade ?? '—'}</b> 이상{#if data.seller.grade}{' '}· 내 등급 <b>{data.seller.grade}</b>{/if}{#if data.quotaText}{' '}· {data.quotaText}{/if}
		</p>
		<table class="stmt" style="min-width:0;width:100%;font-size:13px">
			<tbody>
				{#if q?.buy_mode === 'fixed'}
					<!-- "(1회 한정)" 제거 — 지정가는 가격만 바꾼다(0011:174). 횟수 한도는 무상 샘플에만 있다 -->
					<tr><td>브랜드 지정 샘플가</td><td class="num"><b>₩{fmtNum(price)}</b></td></tr>
				{:else}
					<tr><td>판매가</td><td class="num">₩{fmtNum(p.sale_price)}</td></tr>
					<tr><td>− 내 수수료 {pct(p.commission_rate)}%</td><td class="num">−₩{fmtNum(p.sale_price - price)}</td></tr>
					<tr class="tot"><td>샘플 구매가</td><td class="num">₩{fmtNum(price)}</td></tr>
				{/if}
			</tbody>
		</table>
		<p class="meta" style="margin-top:12px">
			결제 수단은 <b>현금</b>(셀러리 안전결제) 또는 <b>🥬 우선</b>{#if celMax > 0}
				(🥬 {celMax}{cashRest ? ` + ₩${fmtNum(cashRest)}` : ''} · 1🥬 = ₩{fmtNum(celWon)} · 보유 🥬 {data.balance}){:else}
				(₩{fmtNum(celWon)} 미만이라 🥬 사용 불가){/if} — 다음 화면에서 고르고 배송지를 확인한 뒤 결제합니다.
		</p>
		<p class="meta" style="margin-top:8px">
			구매 샘플은 브랜드 승인 없이 바로 발송 단계로 넘어가고, 이달 무상 한도를 쓰지 않습니다. 브랜드는 일반 판매 1건과 동일하게 정산받습니다(플랫폼 수수료 10% 동일).{#if q?.refund}{' '}<b>이 상품은 판매 확정 시 샘플 구매액을 환급합니다.</b>{/if}
		</p>
		<div class="btnrow" style="justify-content:flex-end;margin-top:12px">
			{#if !b.disabled && data.payHref}
				<a href={data.payHref} class="btn pri" title={b.title ?? undefined}>{b.label} →</a>
			{:else}
				<button type="button" class="pri" disabled aria-disabled="true" title={b.title ?? undefined} style="opacity:.6">{b.label}</button>
			{/if}
		</div>
		{#if b.disabled}<p class="meta" style="margin-top:8px;text-align:right">{BUY_COMING_SOON}</p>{/if}
	</section>
{:else if b.kind === 'locked'}
	<section class="card static">
		<div class="lbl-sm">독점 잠김</div>
		<p class="meta" style="margin-top:6px">{b.title}</p>
		<div class="btnrow" style="margin-top:10px"><button type="button" class="sm" disabled aria-disabled="true" style="opacity:.5">{b.label}</button></div>
	</section>
{:else if b.kind === 'active'}
	<section class="card static">
		<div class="lbl-sm">진행 중인 캠페인</div>
		<p class="meta" style="margin-top:6px">
			이 상품은 이미 진행 중인 캠페인이 있어요{#if q?.campaign_status}
				{@const chip = campaignChip(q.campaign_status)}{' '}— <StatusChip tone={chip.live ? 'live' : chip.tone}>{chip.label}</StatusChip>{/if}. 같은 상품은 캠페인이 끝난 뒤 다시 요청할 수 있어요.
		</p>
		<div class="btnrow" style="margin-top:10px">
			{#if data.campaignHref}<a href={data.campaignHref} class="btn pri sm">캠페인 스레드 보기 →</a>{/if}
		</div>
	</section>
{:else}
	<section class="card static">
		<p class="meta">지금은 샘플을 요청할 수 없는 상품이에요 ({b.label}).</p>
	</section>
{/if}
