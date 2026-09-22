<script lang="ts">
	/**
	 * 지급 관리 — 지급 건 표(상태 칩 · 합계) + 행별 [지급 완료](메모) [보류](사유) [보류 해제] + 파일 두 개:
	 *   [이체 파일 CSV] `GET export.csv?status=&purpose=` — 계좌 **원문**이 실린다(콘솔 화면엔 없음). purpose 필수 · 건마다 sensitive_access_log 가 남는다는 안내.
	 *   [원천징수 자료 CSV] `GET rrn.csv?ids=&purpose=` — 표에서 체크한 인플루언서 지급건의 정산 id. RRN_ENC_KEY 가 없으면 서버가 안내 문구로 응답.
	 * 375px: `.admin-table` 카드 모드 · 폼은 줄바꿈.
	 */
	import { holdLabel, payoutStatusChip } from '@sellery/db/admin/settle-rules';
	import { fmtNum } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
	<span class="meta">이체 파일로 내려받아 이체 → [지급 완료] 표시 · 양측 완료면 정산이 지급 완료</span>
	<a href={data.settlePath} class="btn ghost sm" style="margin-left:auto">정산 실행 →</a>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !data.loaded}
	<p class="notice danger" role="status">지급 데이터를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

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
			<tr><th></th><th>캠페인</th><th>대상</th><th>계좌</th><th class="num">지급액</th><th>상태</th><th>정산일 · 지급일</th><th>처리</th></tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				{@const chip = payoutStatusChip(r.status)}
				<tr class={r.status === 'held' ? 'row-held' : ''}>
					<td data-l="선택" class="admin-pick">{#if r.payee_type === 'seller' && r.settlement_id}<input type="checkbox" aria-label="원천징수 자료에 포함" checked={picked.includes(r.settlement_id)} onchange={(e) => togglePick(r.settlement_id ?? '', e.currentTarget.checked)} />{/if}</td>
					<td data-l="캠페인"><a href={detail(r.campaign_code)} class="console-mono">{r.campaign_code.toUpperCase()}</a><small>{r.title ?? ''}</small></td>
					<td data-l="대상"><span class="chip {r.payee_type === 'seller' ? 'seller' : 'brand'}">{r.payee_type === 'seller' ? '인플루언서' : '브랜드'}</span> {r.payee_name}<small>{r.payee_sub}{r.payee_type === 'seller' ? ` · ${r.settle_type === 'biz' ? '사업자' : '개인'}` : ''}</small></td>
					<td data-l="계좌">{#if r.bank_snapshot?.bank}{r.bank_snapshot.bank} <span class="console-mask">{r.bank_snapshot.account_masked ?? ''}</span><small>{r.bank_snapshot.holder ?? ''}</small>{:else}<span class="meta">미등록</span>{/if}</td>
					<td class="num" data-l="지급액"><b>{money(r.amount)}</b>{#if r.wht}<small>원천징수 {money(r.wht)} 차감</small>{/if}</td>
					<td data-l="상태"><StatusChip tone={chip.tone}>{chip.label}</StatusChip>{#if r.status === 'held'}<small class="console-danger">{r.hold_reason ?? holdLabel(r.hold_code) ?? '운영자 보류'}</small>{/if}{#if r.memo}<small>{r.memo}</small>{/if}</td>
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
					</td>
				</tr>
			{:else}
				<tr><td colspan="8" class="empty">{data.status === 'all' ? '지급 건이 없습니다 — 정산을 실행하면 인플루언서·브랜드 지급 건이 여기에 생겨요' : '이 상태의 지급 건이 없어요'}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="meta" style="margin:8px 3px 0">표시 {data.rows.length}건 · 합계 <b>{money(data.totalAmount)}</b> · 계좌는 뒤 4자리만 보여요. 보류 해제는 파트너 정산 정보 완비를 다시 검사합니다(미완비면 해제 불가). 정산 명세 500건까지 표시돼요.</p>
