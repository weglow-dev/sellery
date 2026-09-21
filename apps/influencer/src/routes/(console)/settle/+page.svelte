<script lang="ts">
	/**
	 * 정산 — 프로토타입 vSellerSettle(정산 내역 표 · 계좌 미등록 경고) + vMy 정산 정보 폼(정산 유형 · 은행 · 계좌 · 예금주 · 사업자등록번호 · 사업자등록증) 을 props 로 이식
	 * (docs/inf-console-plan.md §5.9 · §6 `/settle`). 폼은 전부 SvelteKit 이름 있는 액션(`?/save` `?/setRrn` `?/uploadDoc`) — 평범한 POST 뒤 303 으로 `/settle?msg=` 에 돌아온다.
	 *   정산 정보: 등록된 값은 마스킹(계좌 뒤 4자리 · 사업자번호 뒤 5자리)만 보이고, 저장할 때는 계좌번호를 다시 입력한다(원문을 폼에 채우지 않는다 §4.9).
	 *   원천징수 자료(개인만): 주민등록번호 — 입력 중 형식·검증숫자 힌트(validateRrn, 브라우저) · 저장 뒤 `rrn_mask`(성별 자리만) + 등록일 · 실패해도 입력값을 되돌리지 않는다.
	 *   사업자등록증(사업자만): 업로드 → "등록됨 · 보기"(`/settle/doc` 단기 서명 URL).
	 *   정산 내역: settled(스냅샷) · pending(재계산) 행 — 순매출 · 수수료율 · 세전 · 원천징수 · 실수령 · 상태(settlementStatusLabel) · 합계(지급 완료 · 지급 예정).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { rateLine, settlementStatusLabel, validateRrn, whtLine } from '@sellery/db/partner/settle-rules';
	import { ProductIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const info = $derived(data.info);
	const list = $derived(data.list);
	const saveForm = $derived(form?.form === 'save' ? form : null);
	const v = (k: string, fallback = '') => saveForm?.values?.[k] ?? fallback;
	const invalid = (k: string) => saveForm?.field === k;

	// 정산 유형 — 실패 응답값 → 등록값 → 개인. 라디오가 바뀌면 개인/사업자 블록이 갈린다 (SSR 뒤 JS 가 없어도 두 블록은 서버 판단으로 그려진다)
	let type = $state<'personal' | 'biz'>('personal');
	$effect.pre(() => {
		const init = saveForm?.values?.settle_type ?? info?.settle_type ?? 'personal';
		type = init === 'biz' ? 'biz' : 'personal';
	});

	// 주민등록번호 입력 힌트 (브라우저 검증 — 서버가 다시 검사한다). 값은 어디에도 보내지 않고 서버 응답에도 되돌아오지 않는다.
	let rrn = $state('');
	const rrnDigits = $derived(rrn.replace(/\D/g, ''));
	const rrnHint = $derived(rrnDigits.length === 0 ? null : rrnDigits.length < 13 ? `${rrnDigits.length}/13 자리` : validateRrn(rrnDigits) ? '형식 확인됨 ✓' : '형식이 맞지 않아요 — 숫자 13자리와 검증숫자를 확인해주세요');
	const rrnOk = $derived(rrnDigits.length === 13 && validateRrn(rrnDigits) !== null);

	const whtPct = $derived(Math.round((info?.wht_rate ?? list?.wht_rate ?? 0.033) * 1000) / 10);
	const money = (n: number | null) => (n === null ? '—' : `₩${fmtNum(n)}`);
	const setDate = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');
</script>

<svelte:head>
	<title>정산 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>정산</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">수수료 = 확정 매출 × 수수료율(+등급 보너스) · 개인 인플루언서는 사업소득 원천징수 <b>3.3%</b> 공제, 사업자는 세금계산서 발행 · 판매 종료 <b>D+21</b> 에 등록 계좌로 지급돼요.</p>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !info || !list}
	<p class="notice danger" role="status">정산 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

{#if info && !info.has_bank_info}
	<div class="card static console-hold" role="status">
		<b>⚠ 정산 계좌 미등록</b>
		<span class="meta">계좌를 등록해야 D+21 지급이 실행됩니다 — 등록 전에 정산이 실행되면 <b>지급 보류</b>로 기록되고, 등록하면 다음 지급 배치에 포함돼요.</span>
		<a href="#settle-info" class="btn pri sm">아래에서 등록</a>
	</div>
{/if}

<!-- ---------------- 정산 정보 ---------------- -->
<div class="sec" id="settle-info">
	정산 정보
	{#if info}
		<StatusChip tone={info.has_bank_info ? 'green' : 'red'}>{info.has_bank_info ? '등록 완료' : '미등록'}</StatusChip>
	{/if}
</div>
<section class="card static console-form console-settle">
	{#if info?.has_bank_info}
		<dl class="console-kv" style="margin-bottom:14px">
			<dt>정산 유형</dt>
			<dd>{info.settle_type ? data.typeLabels[info.settle_type] : '—'}</dd>
			<dt>정산 계좌</dt>
			<dd>{info.bank} <span class="console-mask">{info.account_masked}</span> · 예금주 {info.holder}</dd>
			{#if info.settle_type === 'biz'}
				<dt>사업자번호</dt>
				<dd><span class="console-mask">{info.biz_no_masked ?? '—'}</span>{#if info.tax_info?.company}{' '}· {info.tax_info.company}{/if}</dd>
			{/if}
		</dl>
		<p class="meta" style="margin:0 0 12px">바꾸려면 아래 폼을 다시 채워 저장하세요 — 보안을 위해 계좌번호는 화면에 뒤 4자리만 보이고, 저장할 때마다 전체를 다시 입력해요.</p>
	{:else}
		<p class="meta" style="margin:0 0 12px">정산 유형을 고르고 지급받을 계좌를 등록하세요. 예금주는 본인(개인) 또는 사업자 명의와 같아야 해요 — 운영팀이 실명 일치를 확인해요.</p>
	{/if}

	{#if saveForm?.message}
		<p class="notice danger" role="alert">{saveForm.message}</p>
	{/if}

	<form method="post" action="?/save">
		<div class="fld" class:invalid={invalid('settle_type')}>
			<span class="lbl">정산 유형</span>
			<div class="console-radio">
				<label class:on={type === 'personal'}>
					<input type="radio" name="settle_type" value="personal" bind:group={type} />
					<span><b>개인</b><small>사업소득 원천징수 3.3% 공제 후 지급 · 주민등록번호 필요</small></span>
				</label>
				<label class:on={type === 'biz'}>
					<input type="radio" name="settle_type" value="biz" bind:group={type} />
					<span><b>사업자</b><small>세금계산서 발행 · 원천징수 없음 · 사업자등록번호 · 등록증 필요</small></span>
				</label>
			</div>
		</div>
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
				<label for="st-holder">예금주{type === 'biz' ? ' (상호 또는 대표자)' : ''}</label>
				<input id="st-holder" name="holder" value={v('holder', info?.holder ?? '')} maxlength={40} autocomplete="name" required />
			</div>
		</div>
		<div class="fld" class:invalid={invalid('account')}>
			<label for="st-account">계좌번호</label>
			<input id="st-account" name="account" value={v('account')} inputmode="numeric" autocomplete="off" placeholder={info?.account_masked ? `등록된 계좌 ${info.account_masked} — 바꾸거나 다시 입력` : '숫자만 8~16자리'} maxlength={40} required />
			<div class="hint">'-' 없이 숫자만 입력해도 돼요.</div>
		</div>

		{#if type === 'biz'}
			<div class="fld" class:invalid={invalid('biz_no')}>
				<label for="st-bizno">사업자등록번호</label>
				<input id="st-bizno" name="biz_no" value={v('biz_no')} inputmode="numeric" autocomplete="off" placeholder={info?.biz_no_masked ? `등록됨 ${info.biz_no_masked} — 바꾸거나 다시 입력` : '000-00-00000'} maxlength={20} required />
			</div>
			<div class="lbl-sm" style="margin:4px 0 8px">세금계산서 발행 정보 <span class="console-sec-sub">— 선택 · 비워 두면 운영팀이 이메일로 물어봐요</span></div>
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
					<input id="st-biztype" name="biz_type" value={v('biz_type', info?.tax_info?.biz_type ?? '')} maxlength={40} placeholder="서비스" />
				</div>
				<div class="fld">
					<label for="st-bizitem">종목</label>
					<input id="st-bizitem" name="biz_item" value={v('biz_item', info?.tax_info?.biz_item ?? '')} maxlength={40} placeholder="광고대행" />
				</div>
			</div>
			<div class="fld">
				<label for="st-taxemail">세금계산서 수신 이메일</label>
				<input id="st-taxemail" name="tax_email" type="email" value={v('tax_email', info?.tax_info?.email ?? '')} maxlength={120} autocomplete="email" />
			</div>
		{/if}

		<div class="btnrow" style="justify-content:flex-end">
			<button type="submit" class="pri sm">정산 정보 저장</button>
		</div>
	</form>
</section>

<!-- ---------------- 원천징수 자료 (개인) ---------------- -->
{#if type === 'personal'}
	<div class="sec" id="rrn">
		원천징수 자료
		{#if info}
			<StatusChip tone={info.has_rrn ? 'green' : 'amber'}>{info.has_rrn ? '등록됨' : '미등록'}</StatusChip>
		{/if}
	</div>
	<section class="card static console-form">
		<p class="meta" style="margin:0 0 10px">
			개인 인플루언서의 수수료는 <b>사업소득</b>으로 셀러리가 <b>{whtPct}%</b> 를 원천징수해 신고·납부해요. 이 신고(지급명세서)에 <b>주민등록번호</b>가 필요해 한 번만 받습니다.
		</p>
		<ul class="console-privacy">
			<li>입력 즉시 <b>암호화</b>해 저장하고, 화면에는 다시 표시하지 않아요(성별 자리만 남긴 마스크).</li>
			<li>원문은 원천징수 신고 담당자만 열 수 있고, <b>열람 때마다 기록</b>이 남아요.</li>
			<li>보존 기간은 지급명세서 보관 의무(5년)를 따르고, 자세한 내용은 <a href={data.privacyHref} target="_blank" rel="noopener">개인정보처리방침</a>에 있어요.</li>
		</ul>
		{#if info?.has_rrn}
			<dl class="console-kv" style="margin:12px 0 10px">
				<dt>등록됨</dt>
				<dd><span class="console-mask">{info.rrn_mask ?? '******-*******'}</span>{#if info.rrn_set_at}<span class="meta"> · {setDate(info.rrn_set_at)} 등록</span>{/if}</dd>
			</dl>
			<p class="meta" style="margin:0 0 10px">번호가 바뀌었다면 아래에 다시 입력해 저장하세요.</p>
		{/if}
		{#if form?.form === 'rrn' && form.message}
			<p class="notice danger" role="alert">{form.message}</p>
		{/if}
		<form method="post" action="?/setRrn" autocomplete="off">
			<div class="fld">
				<label for="st-rrn">주민등록번호</label>
				<input id="st-rrn" name="rrn" bind:value={rrn} inputmode="numeric" autocomplete="off" placeholder="000000-0000000" maxlength={14} required aria-describedby="st-rrn-hint" />
				<div class="hint" id="st-rrn-hint" style={rrnHint && !rrnOk && rrnDigits.length === 13 ? 'color:var(--color-danger)' : rrnOk ? 'color:var(--color-plat)' : ''}>{rrnHint ?? '숫자 13자리 — 저장 후에는 다시 보이지 않아요'}</div>
			</div>
			<div class="btnrow" style="justify-content:flex-end">
				<button type="submit" class="pri sm">{info?.has_rrn ? '다시 저장' : '암호화 저장'}</button>
			</div>
		</form>
	</section>
{/if}

<!-- ---------------- 사업자등록증 (사업자) ---------------- -->
{#if type === 'biz'}
	<div class="sec" id="doc">
		사업자등록증
		{#if info}
			<StatusChip tone={info.has_biz_doc ? 'green' : 'amber'}>{info.has_biz_doc ? '등록됨' : '미등록'}</StatusChip>
		{/if}
	</div>
	<section class="card static console-form">
		<p class="meta" style="margin:0 0 10px">세금계산서 발행과 사업자 정산 확인용이에요. JPG · PNG · WebP · PDF, {data.docMaxMb}MB 이하. 파일은 비공개 저장소에 보관되고 본인과 운영팀만 볼 수 있어요.</p>
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
{/if}

<!-- ---------------- 정산 내역 ---------------- -->
<div class="sec" style="margin-top:22px">정산 내역</div>
{#if list}
	<div class="mini-stats" style="margin-top:0">
		<div><span class="ms-l">지급 완료 합계</span><span class="ms-v">₩{fmtNum(list.totals.settled_payout)}</span><span class="ms-s">정산 완료 기준</span></div>
		<div><span class="ms-l">지급 예정 합계</span><span class="ms-v" style="color:var(--color-plat)">₩{fmtNum(list.totals.pending_payout)}</span><span class="ms-s">{list.rows.filter((r) => r.kind === 'pending').length}건 · {list.wht_rate === 0 ? '사업자 정산' : '원천징수 후'}</span></div>
	</div>
	<div class="tblw console-settle-table">
		<table>
			<thead>
				<tr><th>판매</th><th>기간</th><th class="num">순매출</th><th class="num">수수료율</th><th class="num">수수료(세전)</th><th class="num">원천징수</th><th class="num">실수령</th><th>상태 · 지급</th></tr>
			</thead>
			<tbody>
				{#each list.rows as r (r.campaign_id)}
					{@const st = settlementStatusLabel(r)}
					<tr>
						<td>
							<a href={`${data.campaignsPath}/${encodeURIComponent(r.campaign_code)}`} class="console-cell-prod">
								<ProductIcon thumbUrl={r.product.thumb_url} emoji={r.product.emoji} size={22} />
								<span><b>{r.product.name}</b><small>{r.brand.name}</small></span>
							</a>
						</td>
						<td class="num">{r.start_date ? md(r.start_date) : '—'}–{r.end_date ? md(r.end_date) : '—'}</td>
						<td class="num">{money(r.net)}</td>
						<td class="num">{rateLine(r.my_rate, r.grade, r.grade_bonus_pp, r.ref_boost_applied)}</td>
						<td class="num">{money(r.my_fee_total)}</td>
						<td class="num">{r.wht === null ? '—' : r.wht_rate === 0 ? '0 (세금계산서)' : `−₩${fmtNum(r.wht)}`}</td>
						<td class="num" style="color:var(--color-plat);font-weight:700">{money(r.my_payout)}{#if r.sample_refund_cash}
								<small style="display:block;font-weight:400;color:var(--color-mute)">샘플 환급 +₩{fmtNum(r.sample_refund_cash)} 포함</small>{/if}</td>
						<td>
							<StatusChip tone={st.tone}>{st.label}</StatusChip>
							{#if st.sub}<small style="display:block;color:var(--color-mute);margin-top:2px;white-space:nowrap">{st.sub}</small>{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="empty">정산 내역이 없습니다 — 판매가 끝나면 여기서 명세를 볼 수 있어요</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="meta" style="margin:8px 3px 0">실수령 = 수수료(세전) − 원천징수{list.wht_rate === 0 ? '(사업자 0)' : ` ${whtLine(list.wht_rate, null).replace('원천징수 ', '')}`} · 등급 보너스·추천 부스트는 플랫폼이 부담해요 · 판매 중·교환·환불 기간 행은 지금 기준 예상값이에요.</p>
{/if}
