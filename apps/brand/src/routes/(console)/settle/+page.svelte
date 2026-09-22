<script lang="ts">
	/**
	 * 정산 — 프로토타입 demo-my 정산 정보 폼(은행 · 계좌 · 예금주 · 사업자등록번호 · 사업자등록증 · 통신판매업 신고번호) + demo-settle 표(vBrandSettle) 를 props 로 이식
	 * (docs/brand-console-plan.md §5 `/brand/settle` · §8). 폼은 SvelteKit 이름 있는 액션(`?/save` `?/uploadDoc`) — 평범한 POST 뒤 303 으로 `/settle?msg=` 에 돌아온다.
	 *   정산 정보: 등록된 값은 마스킹(계좌 뒤 4자리 · 사업자번호 뒤 5자리)만 보이고, 저장할 때는 계좌번호를 다시 입력한다(원문을 폼에 채우지 않는다).
	 *     사업자등록번호는 가입 때 채워졌으면 **불변**(마스킹 표시 · 잠금) — 비어 있는 계정(연결 경로)만 입력(§8). 세금계산서 수신 정보(상호 · 대표자 · 업태 · 종목 · 이메일)는 선택.
	 *   사업자등록증: 업로드 → "등록됨 · 보기"(`/settle/doc` 단기 서명 URL). 자동 발주 메일: 읽기 전용 "준비 중"(§8).
	 *   정산 내역: settled(스냅샷) · pending(재계산) 행 — 순매출 · PG · 인플루언서 수수료 · **플랫폼+PG**(pfGross − bBoost − bDisc + pg · §8) · 브랜드 지급액 · 상태(brandSettlementStatusLabel) · 합계(지급 완료 · 지급 예정 · 보류).
	 *   정산 정보 미완이면 `hold` 안내 — 등록 전에 정산이 실행되면 지급 보류로 기록되고, 등록하면 다음 배치에 포함.
	 */
	import { brandRateLine, brandSettlementStatusLabel } from '@sellery/db/brand/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { PlatformHandle, ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const info = $derived(data.info);
	const list = $derived(data.list);
	const saveForm = $derived(form?.form === 'save' ? form : null);
	const v = (k: string, fallback = '') => saveForm?.values?.[k] ?? fallback;
	const invalid = (k: string) => saveForm?.field === k;
	const money = (n: number | null) => (n === null ? '—' : `₩${fmtNum(n)}`);
	const pendingRows = $derived((list?.rows ?? []).filter((r) => r.kind === 'pending').length);
	const heldRows = $derived((list?.rows ?? []).filter((r) => r.kind === 'settled' && (r.hold_brand || r.payout?.status === 'held' || r.settlement_status === 'held')).length);
</script>

<svelte:head>
	<title>정산 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>정산</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">브랜드 정산액 = 확정 매출 − PG 1.9% − 인플루언서 수수료 − 플랫폼 수수료 10%(등급 할인 반영) · 판매 종료 <b>D+21</b> 에 등록 계좌로 지급돼요. 세금계산서는 정산 명세로 갈음하고 운영팀이 발행해요.</p>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !info || !list}
	<p class="notice danger" role="status">정산 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

{#if info && !info.settle_info_complete}
	<div class="card static console-hold" role="status">
		<b>⚠ 정산 정보 미등록</b>
		<span class="meta">{info.has_bank_info ? '사업자등록번호까지' : '정산 계좌 · 사업자등록번호를'} 등록해야 D+21 지급이 실행됩니다 — 등록 전에 정산이 실행되면 <b>지급 보류</b>로 기록되고, 등록하면 다음 지급 배치에 포함돼요.</span>
		<a href="#settle-info" class="btn pri sm">아래에서 등록</a>
	</div>
{/if}

<!-- ---------------- 정산 정보 ---------------- -->
<div class="sec" id="settle-info">
	정산 정보
	{#if info}
		<StatusChip tone={info.settle_info_complete ? 'green' : 'red'}>{info.settle_info_complete ? '등록 완료' : '미등록'}</StatusChip>
	{/if}
</div>
<section class="card static console-form console-settle">
	{#if info?.has_bank_info || info?.has_biz_no}
		<dl class="console-kv" style="margin-bottom:14px">
			<dt>정산 계좌</dt>
			<dd>{#if info.has_bank_info}{info.bank} <span class="console-mask">{info.account_masked}</span> · 예금주 {info.holder}{:else}<span class="meta">미등록</span>{/if}</dd>
			<dt>사업자번호</dt>
			<dd>{#if info.has_biz_no}<span class="console-mask">{info.biz_no_masked}</span> <span class="meta">· 가입 정보 — 변경은 운영팀</span>{:else}<span class="meta">미등록</span>{/if}</dd>
			{#if info.mail_order_no}
				<dt>통신판매업</dt>
				<dd>{info.mail_order_no}</dd>
			{/if}
			{#if info.has_tax_info && info.tax_info}
				<dt>세금계산서</dt>
				<dd>{[info.tax_info.company, info.tax_info.ceo, info.tax_info.email].filter(Boolean).join(' · ') || '등록됨'}</dd>
			{/if}
		</dl>
		<p class="meta" style="margin:0 0 12px">바꾸려면 아래 폼을 다시 채워 저장하세요 — 보안을 위해 계좌번호는 화면에 뒤 4자리만 보이고, 저장할 때마다 전체를 다시 입력해요.</p>
	{:else}
		<p class="meta" style="margin:0 0 12px">지급받을 사업자 계좌를 등록하세요. 예금주는 상호 또는 대표자 명의와 같아야 해요 — 운영팀이 사업자등록증과 대조해요.</p>
	{/if}

	{#if saveForm?.message}
		<p class="notice danger" role="alert">{saveForm.message}</p>
	{/if}

	<form method="post" action="?/save">
		<div class="console-grid2">
			<div class="fld" class:invalid={invalid('bank')}>
				<label for="st-bank">은행</label>
				<select id="st-bank" name="bank" value={v('bank', info?.bank ?? '')} required>
					<option value="">선택</option>
					{#each data.banks as b (b)}
						<option value={b}>{b}</option>
					{/each}
				</select>
			</div>
			<div class="fld" class:invalid={invalid('holder')}>
				<label for="st-holder">예금주 (상호 또는 대표자)</label>
				<input id="st-holder" name="holder" value={v('holder', info?.holder ?? '')} maxlength={40} autocomplete="organization" required />
			</div>
		</div>
		<div class="fld" class:invalid={invalid('account')}>
			<label for="st-account">계좌번호</label>
			<input id="st-account" name="account" inputmode="numeric" autocomplete="off" placeholder={info?.account_masked ? `등록된 계좌 ${info.account_masked} — 바꾸거나 다시 입력` : '숫자만 8~16자리'} maxlength={40} required />
			<div class="hint">'-' 없이 숫자만 입력해도 돼요.</div>
		</div>
		<div class="console-grid2">
			<div class="fld" class:invalid={invalid('biz_no')}>
				<label for="st-bizno">사업자등록번호</label>
				{#if info?.has_biz_no}
					<input id="st-bizno" value={info.biz_no_masked ?? ''} class="console-mask" disabled aria-describedby="st-bizno-hint" />
					<div class="hint" id="st-bizno-hint">가입 때 등록된 번호는 바꿀 수 없어요 — 변경이 필요하면 운영팀에 알려주세요.</div>
				{:else}
					<input id="st-bizno" name="biz_no" value={v('biz_no')} inputmode="numeric" autocomplete="off" placeholder="000-00-00000" maxlength={20} />
					<div class="hint">한 번 저장하면 바꿀 수 없어요 — 사업자등록증과 같은지 확인해주세요.</div>
				{/if}
			</div>
			<div class="fld" class:invalid={invalid('mail_order_no')}>
				<label for="st-mail">통신판매업 신고번호 <span class="font-normal">(선택)</span></label>
				<input id="st-mail" name="mail_order_no" value={v('mail_order_no', info?.mail_order_no ?? '')} maxlength={80} placeholder="제0000-서울강남-00000호" />
			</div>
		</div>

		<div class="lbl-sm" style="margin:4px 0 8px">세금계산서 수신 정보 <span class="console-sec-sub">— 선택 · 비워 두면 운영팀이 이메일로 물어봐요</span></div>
		<div class="console-grid2">
			<div class="fld">
				<label for="st-company">상호</label>
				<input id="st-company" name="company" value={v('company', info?.tax_info?.company ?? '')} maxlength={60} autocomplete="organization" />
			</div>
			<div class="fld">
				<label for="st-ceo">대표자</label>
				<input id="st-ceo" name="ceo" value={v('ceo', info?.tax_info?.ceo ?? '')} maxlength={40} />
			</div>
			<div class="fld">
				<label for="st-biztype">업태</label>
				<input id="st-biztype" name="biz_type" value={v('biz_type', info?.tax_info?.biz_type ?? '')} maxlength={40} placeholder="도소매" />
			</div>
			<div class="fld">
				<label for="st-bizitem">종목</label>
				<input id="st-bizitem" name="biz_item" value={v('biz_item', info?.tax_info?.biz_item ?? '')} maxlength={40} placeholder="건강기능식품" />
			</div>
		</div>
		<div class="fld" class:invalid={invalid('tax_email')}>
			<label for="st-taxemail">세금계산서 수신 이메일</label>
			<input id="st-taxemail" name="tax_email" type="email" value={v('tax_email', info?.tax_info?.email ?? '')} maxlength={120} autocomplete="email" />
		</div>

		<div class="btnrow" style="justify-content:flex-end">
			<button type="submit" class="pri sm">정산 정보 저장</button>
		</div>
	</form>
</section>

<!-- ---------------- 사업자등록증 ---------------- -->
<div class="sec" id="doc">
	사업자등록증
	{#if info}
		<StatusChip tone={info.has_biz_doc ? 'green' : 'amber'}>{info.has_biz_doc ? '등록됨' : '미등록'}</StatusChip>
	{/if}
</div>
<section class="card static console-form">
	<p class="meta" style="margin:0 0 10px">정산 계좌 실명 대조와 세금계산서 발행 확인용이에요. JPG · PNG · WebP · PDF, {data.docMaxMb}MB 이하. 파일은 비공개 저장소에 보관되고 본인과 운영팀만 볼 수 있어요.</p>
	{#if info?.has_biz_doc}
		<p class="meta" style="margin:0 0 10px"><StatusChip tone="green">등록됨</StatusChip> <a href={data.docHref} target="_blank" rel="noopener" style="text-decoration:underline">보기</a> — 새 파일을 올리면 이전 파일은 바뀌어요.</p>
	{/if}
	{#if form?.form === 'doc' && form.message}
		<p class="notice danger" role="alert">{form.message}</p>
	{/if}
	<form method="post" action="?/uploadDoc" enctype="multipart/form-data">
		<div class="fld">
			<label for="st-doc">파일</label>
			<input id="st-doc" name="doc" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
		</div>
		<div class="btnrow" style="justify-content:flex-end">
			<button type="submit" class="pri sm">{info?.has_biz_doc ? '파일 변경' : '파일 업로드'}</button>
		</div>
	</form>
</section>

<!-- ---------------- 자동 발주 메일 (읽기 전용) ---------------- -->
<div class="sec">자동 발주 메일 <StatusChip tone="gray">준비 중</StatusChip></div>
<section class="card static">
	<dl class="console-kv">
		<dt>상태</dt>
		<dd>{info?.po_enabled ? '켜짐' : '꺼짐'}{#if info?.po_email}{' '}· {info.po_email}{/if} <span class="meta">— 발송 기능은 준비 중이에요. 지금은 <a href={data.ordersPath} style="text-decoration:underline">주문 · 발주</a>의 [발주서 CSV] 를 쓰세요.</span></dd>
	</dl>
</section>

<!-- ---------------- 정산 내역 ---------------- -->
<div class="sec" style="margin-top:22px">정산 내역</div>
{#if list}
	<div class="mini-stats" style="margin-top:0">
		<div><span class="ms-l">지급 완료 합계</span><span class="ms-v">₩{fmtNum(list.totals.settled_payout)}</span><span class="ms-s">정산 완료 기준</span></div>
		<div><span class="ms-l">지급 예정 합계</span><span class="ms-v" style="color:var(--color-plat)">₩{fmtNum(list.totals.pending_payout)}</span><span class="ms-s">{pendingRows}건 · 지금 기준 예상</span></div>
		<div><span class="ms-l">지급 보류</span><span class="ms-v" style={list.totals.held_payout > 0 ? 'color:var(--color-danger)' : ''}>₩{fmtNum(list.totals.held_payout)}</span><span class="ms-s">{heldRows ? `${heldRows}건 · 정산 정보 등록 시 지급` : '보류 없음'}</span></div>
	</div>
	<div class="tblw console-settle-table console-brand-settle-table">
		<table>
			<thead>
				<tr><th>판매</th><th>인플루언서</th><th>기간</th><th class="num">순매출</th><th class="num">PG</th><th class="num">인플루언서 수수료</th><th class="num">플랫폼+PG</th><th class="num">브랜드 지급액</th><th>상태 · 지급</th></tr>
			</thead>
			<tbody>
				{#each list.rows as r (r.campaign_id)}
					{@const st = brandSettlementStatusLabel(r)}
					<tr>
						<td data-l="판매">
							<a href={`${data.campaignsPath}/${encodeURIComponent(r.campaign_code)}`} class="console-cell-prod">
								<ProductIcon thumbUrl={r.product.thumb_url} emoji={r.product.emoji} size={22} />
								<span><b>{r.product.name}</b><small>{r.campaign_code}</small></span>
							</a>
						</td>
						<td data-l="인플루언서"><PlatformHandle platform={r.seller.platform} handle={r.seller.handle} name={r.seller.name} /></td>
						<td class="num" data-l="기간">{r.start_date ? md(r.start_date) : '—'}–{r.end_date ? md(r.end_date) : '—'}</td>
						<td class="num" data-l="순매출">{money(r.net)}</td>
						<td class="num" data-l="PG">{r.pg_fee === null ? '—' : `−₩${fmtNum(r.pg_fee)}`}</td>
						<td class="num" data-l="인플루언서 수수료">{r.seller_fee === null ? '—' : `−₩${fmtNum(r.seller_fee)}`}<small>{brandRateLine(r.seller_rate)}</small></td>
						<td class="num" data-l="플랫폼+PG">{r.platform_pg === null ? '—' : `−₩${fmtNum(r.platform_pg)}`}{#if r.brand_discount || r.brand_ref_boost}<small>할인 +₩{fmtNum((r.brand_discount ?? 0) + (r.brand_ref_boost ?? 0))}{r.brand_grade ? ` · ${r.brand_grade}` : ''}</small>{/if}</td>
						<td class="num" data-l="브랜드 지급액" style="color:var(--color-plat);font-weight:700">{money(r.brand_payout)}</td>
						<td data-l="상태 · 지급">
							<StatusChip tone={st.tone}>{st.label}</StatusChip>
							{#if st.sub}<small style="display:block;color:var(--color-mute);margin-top:2px">{st.sub}</small>{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="9" class="empty">정산 내역이 없습니다 — 판매가 끝나면 여기서 명세를 볼 수 있어요</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="meta" style="margin:8px 3px 0">브랜드 지급액 = 순매출 − 인플루언서 수수료 − 플랫폼+PG (PG 열은 플랫폼+PG 에 포함된 금액) · 플랫폼+PG 는 플랫폼 10% 에서 브랜드 등급·추천 할인을 뺀 뒤 PG 1.9% 를 더한 브랜드 실제 부담이에요 · 등급 보너스·추천 부스트는 셀러리가 부담해요 · 판매 중·교환·환불 기간 행은 지금 기준 예상값이고, 정산 완료 행은 실행 시점 스냅샷이에요.</p>
{/if}
