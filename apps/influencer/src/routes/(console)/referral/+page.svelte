<script lang="ts">
	/**
	 * 추천 프로그램 — 프로토타입 `(demo)/ref/+page.svelte` 를 콘솔 화면으로. 데모와 같은 구성:
	 *   피추천 배너(내가 추천받아 가입했으면) → 2열 카드(내 추천 코드(복사) | 보상 구조) →
	 *   KPI 2장(누적 수익 · 추천 인원) → 추천 현황(인플루언서별 보상 판매 진행 n/5 · 발생 수익).
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
	/** "나 (추천인) — …" 를 머리(굵게)와 설명으로 나눈다 */
	const splitTerm = (line: string) => {
		const i = line.indexOf(' — ');
		return i < 0 ? { head: line, tail: '' } : { head: line.slice(0, i), tail: line.slice(i + 3) };
	};
</script>

<svelte:head>
	<title>추천 프로그램 — 셀러리</title>
</svelte:head>

<div class="console-head">
	<h2>추천 프로그램</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta ref-lead">
	인플루언서가 인플루언서를 데려오면 둘 다 이득 — <b>전액 셀러리 부담</b>이라 내 수수료율은 그대로예요.
</p>

{#if data.failed}
	<p class="notice danger" role="status">추천 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if f}
	{#if f.boost}
		<div class="card static ref-boost" role="status">
			<b>🌱 추천 부스트 적용 중</b> — {boostLine(f.boost, f.times)}
		</div>
	{/if}

	<div class="console-grid2 ref-top">
		<section class="card static">
			<div class="lbl-sm">내 추천 코드</div>
			{#if f.refCode}
				<div class="ref-code-row">
					<span class="ref-code">{f.refCode}</span>
					<CopyButton text={f.refCode} label="코드 복사" />
				</div>
				<p class="ref-desc">동료 인플루언서가 가입할 때 이 코드를 입력하면 보상이 시작돼요.</p>
			{:else}
				<p class="ref-desc ref-desc-empty">추천 코드가 아직 발급되지 않았어요 — 문의해주세요.</p>
			{/if}
		</section>

		<section class="card static">
			<div class="lbl-sm">보상 구조</div>
			<ul class="ref-terms">
				{#each referralTerms(f.times) as line (line)}
					{@const t = splitTerm(line)}
					<li><b>{t.head}</b>{#if t.tail} — {t.tail}{/if}</li>
				{/each}
			</ul>
		</section>
	</div>

	<div class="console-grid2 ref-kpis">
		<div class="card static kpi">
			<div class="lbl">누적 추천 수익</div>
			<div class="val plat">₩{fmtNum(f.total)}</div>
			<div class="sub">{REFERRAL_TOTAL_NOTE}</div>
		</div>
		<div class="card static kpi">
			<div class="lbl">내가 추천한 인플루언서</div>
			<div class="val">{fmtNum(f.count)}명</div>
			<div class="sub">인플루언서당 최대 {f.times}회 판매까지 보상</div>
		</div>
	</div>

	<div class="sec">
		추천 현황
		{#if f.rows.length}<span class="badge">{fmtNum(f.rows.length)}</span>{/if}
	</div>
	{#if f.rows.length}
		<div class="listcard console-rows ref-list">
			{#each f.rows as row (row.handle ?? row.name)}
				{@const done = Math.min(row.used, row.times)}
				<div class="rowitem">
					<SellerAvatar avatarUrl={row.avatarUrl} size={40} />
					<div class="grow">
						<div class="nm">
							{row.name ?? '알 수 없음'}
							{#if row.handle}<span class="hd">{row.handle}</span>{/if}
						</div>
						<div class="ref-prog" aria-label="보상 판매 진행 {done} / {row.times}회">
							<span class="dots" aria-hidden="true">
								{#each Array.from({ length: row.times }, (_, k) => k) as k (k)}
									<i class:on={k < done}></i>
								{/each}
							</span>
							<span class="txt">보상 판매 {done} / {row.times}회{#if done >= row.times} · 완료{/if}</span>
						</div>
					</div>
					<div class="rowacts ref-amt">
						<span class="k">발생 수익</span>
						<b>₩{fmtNum(row.amount)}</b>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="listcard"><div class="empty ref-empty">{REFERRAL_EMPTY}</div></div>
	{/if}

	<p class="ref-foot">
		보상은 <a href={data.settlePath}>정산</a>에 함께 지급돼요 · 내 순위는 <a href={data.rankPath}>랭킹</a>에서 볼 수 있어요.
	</p>
{/if}

<style>
	.ref-lead {
		margin: -8px 3px 14px;
	}

	/* 부스트 배너 — 데모: 강조 테두리 카드 */
	.ref-boost {
		margin: 3px 3px 14px;
		font-size: 13px;
		line-height: 1.7;
		word-break: keep-all;
		box-shadow: inset 0 0 0 2px var(--color-accent), var(--shadow-lift-2);
		background: var(--color-lime-soft);
	}

	.ref-top,
	.ref-kpis {
		gap: 0 14px;
		align-items: stretch;
	}
	.ref-top > .card,
	.ref-kpis > .card {
		margin-bottom: 12px;
	}
	.ref-desc {
		font-size: 12.5px;
		color: var(--color-mute);
		margin: 0;
		line-height: 1.6;
		word-break: keep-all;
	}
	.ref-desc-empty {
		margin-top: 10px;
	}
	.ref-terms :global(b) {
		color: var(--color-ink);
	}
	.ref-terms li {
		word-break: keep-all;
	}

	/* KPI — 데모 `.card.kpi` (lbl · val · sub) */
	.kpi .lbl {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-mute);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 700;
	}
	.kpi .val {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin-top: 6px;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.kpi .sub {
		font-size: 11.5px;
		color: var(--color-mute);
		margin-top: 4px;
		line-height: 1.5;
		word-break: keep-all;
	}
	.plat {
		color: var(--color-plat);
	}

	/* 추천 현황 */
	.ref-list .nm {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}
	.ref-list .hd {
		font-family: var(--font-mono);
		font-size: 11.5px;
		font-weight: 400;
		color: var(--color-mute);
	}
	.ref-prog {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 5px;
	}
	.ref-prog .dots {
		display: inline-flex;
		gap: 3px;
	}
	.ref-prog .dots i {
		width: 14px;
		height: 8px;
		background: var(--color-surface-2);
		box-shadow: var(--shadow-frame-soft);
	}
	.ref-prog .dots i.on {
		background: var(--color-accent);
	}
	.ref-prog .txt {
		font-size: 12px;
		color: var(--color-mute);
	}
	.ref-amt {
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}
	.ref-amt .k {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-mute);
		letter-spacing: 0.06em;
	}
	.ref-amt b {
		font-family: var(--font-display);
		font-size: 16px;
		font-variant-numeric: tabular-nums;
		color: var(--color-plat);
	}
	.ref-empty {
		padding: 24px;
	}

	.ref-foot {
		font-size: 12px;
		color: var(--color-mute);
		margin: 12px 3px 0;
		line-height: 1.6;
	}
	.ref-foot a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
