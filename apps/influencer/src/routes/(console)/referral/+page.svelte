<script lang="ts">
	/**
	 * 추천 프로그램 — 프로토타입 `(demo)/ref/+page.svelte` 를 콘솔 화면으로.
	 *   피추천 배너(내가 추천받아 가입했으면) → 내 추천 코드(복사) + 보상 구조 → 누적 수익 · 추천 인원 →
	 *   추천 현황 표(인플루언서별 보상 판매 진행 n/5 · 발생 수익).
	 *
	 * 프로토타입의 `act.copyRef`(토스트) 대신 공용 `CopyButton` 을 쓴다 — 콘솔의 판매 링크 복사와 같은 동작.
	 * 금액은 정산이 적재한 `referral_earnings` 값이라 이 화면에서는 계산하지 않는다.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import {
		REFERRAL_EMPTY,
		REFERRAL_TOTAL_NOTE,
		boostLine,
		referralTerms
	} from '@sellery/db/partner/rank-rules';
	import { CopyButton, SellerAvatar } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const f = $derived(data.referral);
</script>

<svelte:head>
	<title>추천 프로그램 — 셀러리</title>
</svelte:head>

<div class="console-head">
	<h2>추천 프로그램</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">
	인플루언서가 인플루언서를 데려오면 둘 다 이득 — <b>전액 셀러리 부담</b>이라 내 수수료율은 그대로예요.
</p>

{#if data.failed}
	<p class="notice danger" role="status">추천 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if f}
	{#if f.boost}
		<p class="notice" role="status"><b>🌱 추천 부스트 적용 중</b> — {boostLine(f.boost, f.times)}</p>
	{/if}

	<section class="card static">
		<div class="lbl-sm">내 추천 코드</div>
		{#if f.refCode}
			<div class="ref-code-row">
				<span class="ref-code">{f.refCode}</span>
				<CopyButton text={f.refCode} label="코드 복사" />
			</div>
			<p class="meta">동료 인플루언서가 가입할 때 이 코드를 입력하면 보상이 시작돼요.</p>
		{:else}
			<p class="meta" style="margin-top:8px">추천 코드가 아직 발급되지 않았어요 — 문의해주세요.</p>
		{/if}
	</section>

	<section class="card static" style="margin-top:14px">
		<div class="lbl-sm">보상 구조</div>
		<ul class="ref-terms">
			{#each referralTerms(f.times) as line (line)}
				<li>{line}</li>
			{/each}
		</ul>
	</section>

	<div class="mini-stats console-totals" style="margin-top:14px">
		<div>
			<span class="ms-l">누적 추천 수익</span>
			<span class="ms-v" style="color:var(--color-plat)">₩{fmtNum(f.total)}</span>
			<span class="ms-s">{REFERRAL_TOTAL_NOTE}</span>
		</div>
		<div>
			<span class="ms-l">내가 추천한 인플루언서</span>
			<span class="ms-v">{f.count}명</span>
			<span class="ms-s">인플루언서당 최대 {f.times}회 판매까지 보상</span>
		</div>
	</div>

	<div class="sec" style="margin-top:20px">추천 현황</div>
	{#if f.rows.length}
		<div class="listcard console-rows">
			{#each f.rows as row (row.handle ?? row.name)}
				<div class="rowitem">
					<SellerAvatar avatarUrl={row.avatarUrl} size={40} />
					<div class="grow">
						<div class="nm">
							{row.name ?? '알 수 없음'}
							{#if row.handle}<span class="sub">{row.handle}</span>{/if}
						</div>
						<div class="meta">보상 판매 진행 {row.used} / {row.times}회</div>
					</div>
					<div class="rowacts">
						<b>₩{fmtNum(row.amount)}</b>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="listcard"><div class="empty" style="padding:24px">{REFERRAL_EMPTY}</div></div>
	{/if}

	<p class="meta" style="margin-top:12px">
		보상은 <a href={data.settlePath} style="text-decoration:underline">정산</a>에 함께 지급돼요 · 내 순위는 <a
			href={data.rankPath}
			style="text-decoration:underline">랭킹</a
		>에서 볼 수 있어요.
	</p>
{/if}
