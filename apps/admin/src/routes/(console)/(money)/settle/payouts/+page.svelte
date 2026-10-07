<script lang="ts">
	/**
	 * 지급 관리 — 지급 건 표(상태 칩 · 합계) + 행별 [지급 완료](메모) [보류](사유) [보류 해제] + 파일 두 개:
	 *   [이체 파일 CSV] `GET export.csv?status=&purpose=` — 계좌 **원문**이 실린다(콘솔 화면엔 없음). purpose 필수 · 건마다 sensitive_access_log 가 남는다는 안내.
	 *   [원천징수 자료 CSV] `GET rrn.csv?ids=&purpose=` — 표에서 체크한 인플루언서 지급건의 정산 id. RRN_ENC_KEY 가 없으면 서버가 안내 문구로 응답.
	 * 토스 지급대행(0040 · `data.payoutMode === 'toss'`): 상단 카드(토스 잔액 · 요청 가능/진행 중 건수 · 지급 방식 토글) + 표의 체크박스로 고른 건을 `?/tossRequest`(즉시 EXPRESS 또는 예약일) ·
	 *   행마다 셀러 상태 칩(tossSellerChip) · 지급 상태 칩(tossPayoutChip) · [취소](REQUESTED) · [재조회] · [셀러 동기화]. 결과(요청/건너뜀/오류)는 ActionData 로 표 위에.
	 *   'manual' 에서는 토스 블록·칩이 없고 기존 이체 파일 흐름 그대로(지급 방식 토글만).
	 * 375px: `.admin-table` 카드 모드 · 폼은 줄바꿈.
	 */
	import { holdLabel, payoutStatusChip, payeeTypeLabel, tossPayoutChip, tossSellerChip } from '@sellery/db/admin/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const tossResult = $derived(form?.kind === 'tossRequest' ? form : null);
	const tossMode = $derived(data.payoutMode === 'toss');
	let tossPicked = $state<string[]>([]);
	let schedule = $state<'express' | 'scheduled'>('express');
	let scheduleDate = $state('');
	const tossCandidates = $derived(data.rows.filter((r) => r.toss?.requestable));
	const toggleToss = (id: string, on: boolean) => {
		tossPicked = on ? [...new Set([...tossPicked, id])] : tossPicked.filter((x) => x !== id);
	};
	const pickAllToss = () => {
		tossPicked = tossCandidates.map((r) => r.id);
	};
	const inFlight = (st: string | null | undefined) => st === 'REQUESTED' || st === 'IN_PROGRESS';
	const money = (n: number) => `₩${fmtNum(n)}`;
	const detail = (code: string) => `${data.settlePath}/${encodeURIComponent(code)}`;
	let purpose = $state('');
	let rrnPurpose = $state('');
	let picked = $state<string[]>([]);
	const rrnCandidates = $derived(data.rows.filter((r) => r.payee_type === 'seller' && r.settlement_id));
	const togglePick = (id: string, on: boolean) => {
		picked = on ? [...new Set([...picked, id])] : picked.filter((x) => x !== id);
	};
	const exportStatus = $derived(data.status === 'all' ? 'all' : data.status);
</script>

<svelte:head>
	<title>지급 관리 — 셀러리 관리자</title>
</svelte:head>

<div class="console-head">
	<h2>지급 관리</h2>
	{#if data.counts.pending}<span class="badge">대기 {data.counts.pending}</span>{/if}
	<span class="meta">{tossMode ? '토스 지급대행으로 요청 → 웹훅이 이체 완료를 받으면 자동으로 지급 완료 (이체 파일은 폴백)' : '이체 파일로 내려받아 이체 → [지급 완료] 표시 · 양측 완료면 정산이 지급 완료'}</span>
	<a href={data.settlePath} class="btn ghost sm" style="margin-left:auto">정산 실행 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !data.loaded}
	<p class="notice danger" role="status">지급 데이터를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

<!-- ---------------- 토스 지급대행 (0040) ---------------- -->
<section class="card static admin-files admin-toss" aria-label="토스 지급대행">
	<div class="admin-inline-form" style="margin:0">
		<span class="lbl">지급 방식 — {tossMode ? '토스 지급대행' : '이체 파일 (수동)'}</span>
		{#if tossMode}
			{#if data.toss?.configured}
				<span>토스 잔액 <b>{data.toss.balance ? money(data.toss.balance.available) : '—'}</b>{#if data.toss.balance?.pending}{' '}<span class="meta">(정산 대기 {money(data.toss.balance.pending)})</span>{/if}{#if data.toss.balanceError}{' '}<span class="console-danger">{data.toss.balanceError}</span>{/if}</span>
				<span class="meta">· 요청 가능 {data.toss.requestable}건 · 진행 중 {data.toss.inFlight}건</span>
			{:else}
				<span class="console-danger">지급대행 키(TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY)가 없어요 — 잔액 조회·지급 요청이 되지 않아요. 이체 파일로 지급하세요.</span>
			{/if}
		{/if}
		<form method="post" action="?/payoutMode" style="margin-left:auto" onsubmit={(e) => { if (!confirm(tossMode ? '이체 파일(수동) 방식으로 되돌릴까요? 토스 조건으로 보류된 건이 풀립니다.' : '토스 지급대행으로 바꿀까요? 토스 셀러가 준비되지 않은 파트너의 지급은 보류로 바뀝니다.')) e.preventDefault(); }}>
			<input type="hidden" name="mode" value={tossMode ? 'manual' : 'toss'} />
			<button type="submit" class="ghost sm">{tossMode ? '수동(이체 파일)으로 전환' : '토스 지급대행으로 전환'}</button>
		</form>
	</div>
	{#if tossMode && data.toss?.configured}
		<form method="post" action="?/tossRequest" class="console-form admin-inline-form" onsubmit={(e) => { const n = (e.submitter as HTMLButtonElement | null)?.value === 'all' ? data.toss?.requestable ?? 0 : tossPicked.length; if (!confirm(`${n}건을 토스 지급대행으로 ${schedule === 'express' ? '즉시' : `예약(${scheduleDate || '다음 영업일'})`} 요청할까요? 요청 뒤에는 REQUESTED 상태에서만 취소할 수 있어요.`)) e.preventDefault(); }}>
			{#each tossPicked as id (id)}<input type="hidden" name="toss_ids" value={id} />{/each}
			<label class="lbl" for="toss-schedule">토스로 지급 요청</label>
			<select id="toss-schedule" name="schedule" bind:value={schedule} style="flex:0 0 auto">
				<option value="express">즉시 (EXPRESS · 영업일 08~15시)</option>
				<option value="scheduled">예약 (SCHEDULED · 다음 영업일 이후)</option>
			</select>
			{#if schedule === 'scheduled'}
				<input type="date" name="date" bind:value={scheduleDate} aria-label="예약일" style="flex:0 0 auto" />
			{/if}
			<button type="submit" class="pri sm" name="all" value="0" disabled={!tossPicked.length}>선택 {tossPicked.length}건 요청</button>
			<button type="button" class="ghost sm" onclick={pickAllToss} disabled={!tossCandidates.length}>요청 가능 전부 선택 ({tossCandidates.length})</button>
			<button type="submit" class="ghost sm" name="all" value="1" disabled={!data.toss.requestable}>전체 대기 요청 ({data.toss.requestable})</button>
			<span class="hint">표의 "토스" 체크박스로 고른 건만 보내요. 셀러 상태가 지급 가능(PARTIALLY_APPROVED · APPROVED)이고 진행 중이 아닌 건만 요청돼요. 100건씩 나눠 보내고 요청 결과는 아래에 표시돼요.</span>
		</form>
	{/if}
	{#if tossResult}
		<div class={`notice ${tossResult.ok ? 'ok' : 'danger'}`} role="status">
			<b>{tossResult.summary}</b>
			{#if tossResult.requested.length}
				<ul style="margin:6px 0 0 18px">
					{#each tossResult.requested as r (r.payout_id)}<li>{r.payee_name ?? '—'} {money(r.amount)} → <span class="console-mono">{r.toss_payout_id}</span> {r.status}</li>{/each}
				</ul>
			{/if}
			{#if tossResult.skipped.length}
				<ul style="margin:6px 0 0 18px">
					{#each tossResult.skipped as r (r.payout_id)}<li class="meta">건너뜀 <span class="console-mono">{r.payout_id.slice(0, 8)}</span> — {r.reason}</li>{/each}
				</ul>
			{/if}
			{#if tossResult.errors.length}
				<ul style="margin:6px 0 0 18px">
					{#each tossResult.errors as r (r.code + r.payout_ids.join(','))}<li class="console-danger">{r.code} — {r.message}{#if r.payout_ids.length}{' '}({r.payout_ids.length}건){/if}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<nav class="cats console-filters" aria-label="지급 상태 필터">
	{#each data.chips as f (f.key)}
		<a href={f.href} class="catchip {data.status === f.key ? 'on' : ''}" aria-current={data.status === f.key ? 'page' : undefined}>{f.label} <span class="n">{f.n}</span></a>
	{/each}
</nav>

<!-- ---------------- 파일 ---------------- -->
<section class="card static admin-files">
	<form method="get" action={data.exportPath} class="console-form admin-inline-form" target="_blank">
		<input type="hidden" name="status" value={exportStatus} />
		<label class="lbl" for="po-purpose">이체 파일 (계좌 원문)</label>
		<input id="po-purpose" name="purpose" bind:value={purpose} maxlength={80} placeholder="목적 — 예: 지급 배치 2026-10" required />
		<button type="submit" class="pri sm" disabled={!purpose.trim() || !data.rows.length}>이체 파일 CSV ({data.status === 'all' ? '전체' : data.chips.find((c) => c.key === data.status)?.label} {data.rows.length}건)</button>
		<span class="hint">계좌 원문이 실려요 — 다운로드마다 지급건 수만큼 열람 로그(sensitive_access_log)가 남고, 목적이 함께 기록됩니다.</span>
	</form>
	<form method="get" action={data.rrnPath} class="console-form admin-inline-form" target="_blank">
		{#each picked as id (id)}<input type="hidden" name="ids" value={id} />{/each}
		<label class="lbl" for="rrn-purpose">원천징수 자료 (주민등록번호)</label>
		<input id="rrn-purpose" name="purpose" bind:value={rrnPurpose} maxlength={80} placeholder="목적 — 예: 2026-09 지급명세서" />
		<button type="submit" class="ghost sm" disabled={!picked.length}>원천징수 자료 CSV ({picked.length}건)</button>
		<span class="hint">표에서 인플루언서 지급건을 체크하세요. 개인 인플루언서만 번호가 실리고(사업자는 비고), 복호 키(RRN_ENC_KEY)가 없으면 내려받을 수 없어요. 호출마다 열람 로그가 남아요.</span>
	</form>
</section>

<!-- ---------------- 표 ---------------- -->
<div class="tblw admin-table admin-payouts">
	<table>
		<thead>
			<tr><th></th>{#if tossMode}<th>토스</th>{/if}<th>캠페인</th><th>대상</th><th>계좌</th><th class="num">지급액</th><th>상태</th><th>정산일 · 지급일</th><th>처리</th></tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				{@const chip = payoutStatusChip(r.status)}
				<tr class={r.status === 'held' ? 'row-held' : ''}>
					<td data-l="선택" class="admin-pick">{#if r.payee_type === 'seller' && r.settlement_id}<input type="checkbox" aria-label="원천징수 자료에 포함" checked={picked.includes(r.settlement_id)} onchange={(e) => togglePick(r.settlement_id ?? '', e.currentTarget.checked)} />{/if}</td>
					{#if tossMode}
						<td data-l="토스" class="admin-pick">{#if r.toss?.requestable}<input type="checkbox" aria-label="토스 지급 요청에 포함" checked={tossPicked.includes(r.id)} onchange={(e) => toggleToss(r.id, e.currentTarget.checked)} />{:else if r.toss?.reason && r.status === 'pending'}<small class="meta" title={r.toss.reason}>{r.toss.reason === 'IN_FLIGHT' ? '진행 중' : r.toss.reason === 'NO_TOSS_SELLER' ? '셀러 없음' : r.toss.reason === 'TOSS_SELLER_PENDING' ? '셀러 대기' : r.toss.reason}</small>{/if}</td>
					{/if}
					<td data-l="캠페인"><a href={detail(r.campaign_code)} class="console-mono">{r.campaign_code.toUpperCase()}</a><small>{r.title ?? ''}</small></td>
					<td data-l="대상"><span class="chip {r.payee_type}">{payeeTypeLabel(r.payee_type)}</span> {r.payee_name}<small>{r.payee_sub}{r.payee_type === 'seller' ? ` · ${r.settle_type === 'biz' ? '사업자' : '개인'}` : ''}</small></td>
					<td data-l="계좌">{#if r.bank_snapshot?.bank}{r.bank_snapshot.bank} <span class="console-mask">{r.bank_snapshot.account_masked ?? ''}</span><small>{r.bank_snapshot.holder ?? ''}</small>{:else}<span class="meta">미등록</span>{/if}</td>
					<td class="num" data-l="지급액"><b>{money(r.amount)}</b>{#if r.wht}<small>원천징수 {money(r.wht)} 차감</small>{/if}</td>
					<td data-l="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip>{#if r.status === 'held'}<small class="console-danger">{r.hold_reason ?? holdLabel(r.hold_code) ?? '운영자 보류'}</small>{/if}{#if r.memo}<small>{r.memo}</small>{/if}
						{#if tossMode && r.toss}
							{@const sc = tossSellerChip(r.toss.toss_seller_status, r.toss.toss_seller_error)}
							{@const pc = tossPayoutChip(r.toss_payout_status)}
							<small style="display:block;margin-top:4px"><StatusChip tone={sc.tone}>셀러 · {sc.label}</StatusChip>{#if pc}{' '}<StatusChip tone={pc.tone}>{pc.label}</StatusChip>{/if}</small>
							{#if r.toss.toss_seller_error?.message}<small class="console-danger">{r.toss.toss_seller_error.message}</small>{/if}
							{#if r.toss_error?.message}<small class="console-danger">토스: {r.toss_error.message}</small>{/if}
							{#if r.toss_payout_id}<small class="console-mono">{r.toss_payout_id}{#if r.toss_schedule_date}{' '}· {r.toss_schedule_date}{/if}</small>{/if}
						{/if}</td>
					<td data-l="정산일 · 지급일" class="console-mono">{r.settled_at ? md(r.settled_at) : '—'}{#if r.paid_at}<small>지급 {md(r.paid_at)}</small>{/if}</td>
					<td data-l="처리" class="admin-row-act">
						{#if r.status === 'pending'}
							<details class="console-reject admin-act">
								<summary class="btn pri sm">지급 완료</summary>
								<form method="post" action="?/paid" class="console-form console-reject-form" onsubmit={(e) => { if (!confirm(`${r.payee_name} ${money(r.amount)} 을 지급 완료로 표시할까요? 실제 이체를 마친 뒤에만 눌러주세요.`)) e.preventDefault(); }}>
									<input type="hidden" name="payout_id" value={r.id} />
									<input name="memo" maxlength={200} placeholder="메모 (선택)" aria-label="지급 메모" />
									<button type="submit" class="pri sm">확정</button>
								</form>
							</details>
							<details class="console-reject admin-act">
								<summary class="btn ghost sm">보류</summary>
								<form method="post" action="?/hold" class="console-form console-reject-form">
									<input type="hidden" name="payout_id" value={r.id} />
									<input name="reason" maxlength={200} placeholder="보류 사유 (선택)" aria-label="보류 사유" />
									<button type="submit" class="ghost sm">보류</button>
								</form>
							</details>
						{:else if r.status === 'held'}
							<form method="post" action="?/release" style="margin:0">
								<input type="hidden" name="payout_id" value={r.id} />
								<button type="submit" class="pri sm">보류 해제</button>
							</form>
						{:else}
							<span class="meta">완료</span>
						{/if}
						{#if tossMode && r.toss}
							{#if r.status === 'pending' && r.toss_payout_status === 'REQUESTED'}
								<form method="post" action="?/tossCancel" class="admin-act" style="margin:4px 0 0" onsubmit={(e) => { if (!confirm('토스 지급 요청을 취소할까요? (REQUESTED 상태에서만 가능)')) e.preventDefault(); }}>
									<input type="hidden" name="payout_id" value={r.id} />
									<button type="submit" class="ghost sm">토스 취소</button>
								</form>
							{/if}
							{#if r.toss_payout_id && r.status !== 'paid'}
								<form method="post" action="?/tossRefresh" class="admin-act" style="margin:4px 0 0">
									<input type="hidden" name="payout_id" value={r.id} />
									<button type="submit" class="ghost sm">재조회</button>
								</form>
							{/if}
							{#if r.status !== 'paid' && r.toss.payee_id && !inFlight(r.toss_payout_status)}
								<form method="post" action="?/tossSync" class="admin-act" style="margin:4px 0 0">
									<input type="hidden" name="payee_type" value={r.payee_type === 'brand' ? 'brand' : 'seller'} />
									<input type="hidden" name="payee_id" value={r.toss.payee_id} />
									<button type="submit" class="ghost sm">셀러 동기화</button>
								</form>
							{/if}
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan={tossMode ? 9 : 8} class="empty">{data.status === 'all' ? '지급 건이 없습니다 — 정산을 실행하면 인플루언서·브랜드 지급 건이 여기에 생겨요' : '이 상태의 지급 건이 없어요'}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="meta" style="margin:8px 3px 0">표시 {data.rows.length}건 · 합계 <b>{money(data.totalAmount)}</b> · 계좌는 뒤 4자리만 보여요. 정산 정보 미등록 보류는 파트너가 정보를 등록하면 풀려 지급 대기가 되고, 관리자가 확인 후 {tossMode ? '토스 지급대행으로 요청(또는 이체 파일로)' : '이체 파일로'} 지급합니다. [보류 해제]는 운영자 보류용이며, 파트너 정산 정보 완비를 다시 검사합니다(미완비면 해제 불가).{#if tossMode}{' '}토스 모드에서는 파트너의 토스 셀러가 지급 가능 상태(본인인증 완료)여야 지급 대기가 되고, 이체 완료 웹훅이 오면 자동으로 지급 완료가 돼요.{/if} 정산 명세 500건까지 표시돼요.</p>
