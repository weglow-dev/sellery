<script lang="ts">
	/**
	 * 인플루언서 갤러리 — 프로토타입 `(demo)/gallery/+page.svelte` + `packages/ui/SellerCard.svelte` 를
	 * 콘솔 화면으로. 데모 화면은 이 PR 에서 지웠다(실서비스가 `/gallery` 를 가져감 — 인플루언서 `/sales`
	 * `/settle` 때와 같은 방식).
	 *   필터(등급 이상 · 메인 SNS) → 맞춤 추천 2명 → 전체 공개 인플루언서 → 익명 스카우트.
	 *   카드의 지표는 열람해야 보인다 — **서버가 잠긴 카드의 지표를 보내지 않으므로** 가린 게 아니라 없다.
	 *   익명 카드는 열람 전 이름·핸들도 오지 않아 ○○○ 으로만 보인다.
	 *
	 * 데모에서 가져오지 않은 것: `featured`(프로필 상단 노출) 아이템 가중치 — 셀러리 샵이 아직 없어
	 *   그 아이템을 살 수 없다. 추천은 카테고리 적합 + 매출 효율만으로 뽑는다(0035).
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import {
		EXTERNAL_NOTE,
		GALLERY_EMPTY,
		GALLERY_SUB,
		GRADE_FILTERS,
		PLATFORM_FILTERS,
		SCOUT_NOTE,
		freeReasonBadge,
		gradeAtLeast,
		recommendReason,
		scoutLabel
	} from '@sellery/db/brand/gallery-rules';
	import { GradeBox, PlatformHandle, SellerAvatar } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const g = $derived(data.gallery);

	let grade = $state<string>('전체');
	let plat = $state<string>('all');

	const match = (row: { grade: string | null; platform: string | null }) =>
		gradeAtLeast(row.grade, grade) && (plat === 'all' || row.platform === plat);

	const rows = $derived((g?.rows ?? []).filter(match));
	const recs = $derived((g?.rows ?? []).filter((r) => g?.recommendedIds.includes(r.id)));
	// 익명 카드는 열람 전 platform 이 없다 — SNS 필터를 적용하면 전부 사라지므로 등급만 거른다
	const scout = $derived((g?.scout ?? []).filter((s) => gradeAtLeast(s.grade, grade)));
</script>

<svelte:head>
	<title>인플루언서 갤러리 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>인플루언서 갤러리</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">{GALLERY_SUB}</p>

{#if data.notice}
	<p class={`notice ${data.notice.tone === 'danger' ? 'danger' : 'ok'}`} role="status">{data.notice.text}</p>
{/if}

{#if data.failed}
	<p class="notice danger" role="status">갤러리를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{:else if g}
	{#if g.freeLeft > 0}
		<p class="notice" role="status">
			<b>{g.brand.grade} 등급 혜택</b> — 이번 달 데이터 열람 <b>{g.freeLeft}회</b> 무료예요.
		</p>
	{/if}

	<section class="card static">
		<div class="gal-filter">
			<span class="lbl-sm">등급</span>
			<div class="gal-chips">
				{#each GRADE_FILTERS as gf (gf)}
					<button type="button" class="catchip" class:on={grade === gf} onclick={() => (grade = gf)}>
						{gf === '전체' ? '전체' : `${gf} 이상`}
					</button>
				{/each}
			</div>
		</div>
		<div class="gal-filter">
			<span class="lbl-sm">메인 SNS</span>
			<div class="gal-chips">
				{#each PLATFORM_FILTERS as [k, l] (k)}
					<button type="button" class="catchip" class:on={plat === k} onclick={() => (plat = k)}>{l}</button>
				{/each}
			</div>
		</div>
	</section>

	{#snippet statRow(row: (typeof rows)[number])}
		{#if row.stats}
			<div class="mini-stats">
				<div><span class="ms-l">3개월 매출</span><span class="ms-v">₩{fmtNum(row.stats.m3Sales)}</span></div>
				<div>
					<span class="ms-l">판매당 평균</span>
					<span class="ms-v">{row.stats.avgNet !== null ? `₩${fmtNum(row.stats.avgNet)}` : '—'}</span>
					<span class="ms-s">진행 {row.stats.campaignsDone}건</span>
				</div>
				<div><span class="ms-l">좋아요 평균</span><span class="ms-v">{fmtNum(row.stats.likesAvg ?? 0)}</span></div>
				<div>
					<span class="ms-l">참여율</span>
					<span class="ms-v">{row.stats.engagement !== null ? `${row.stats.engagement}%` : '—'}</span>
					<span class="ms-s">매출/팔로워 {row.stats.perFollower !== null ? `₩${fmtNum(row.stats.perFollower)}` : '—'}</span>
				</div>
			</div>
			{#if row.stats.recentLikes.length}
				{@const mx = Math.max(...row.stats.recentLikes, 1)}
				<div class="lbl-sm" style="margin:10px 0 6px">최근 게시물 반응</div>
				<div class="spark">
					{#each row.stats.recentLikes as v, i (i)}<span style="height:{Math.max(12, (v / mx) * 100)}%"></span>{/each}
				</div>
			{/if}
			<div class="lbl-sm" style="margin:12px 0 6px">
				📡 외부 판매 감지 · 예상 매출 <span class="gal-est" title={EXTERNAL_NOTE}>(가계산)</span>
			</div>
			{#each row.stats.external as x (x.name)}
				<div class="gal-ext">
					<span class="truncate">{x.name}{#if x.brand} · {x.brand}{/if}{#if x.seenOn} · {x.seenOn}{/if}</span>
					<span class="num">예상 ₩{fmtNum(Math.round(x.estLow / 1e4))}만–{fmtNum(Math.round(x.estHigh / 1e4))}만</span>
				</div>
			{:else}
				<p class="meta">최근 외부 판매 감지 없음</p>
			{/each}
		{/if}
	{/snippet}

	{#snippet unlockForm(id: string, kind: 'data' | 'ref', price: number, name: string | null)}
		<form method="post" action="?/unlock" class="console-form">
			<input type="hidden" name="seller" value={id} />
			<input type="hidden" name="kind" value={kind} />
			<input type="hidden" name="name" value={name ?? ''} />
			<button type="submit" class="pri sm">🔓 🥬 {price} · {kind === 'ref' ? '레퍼런스 열람' : '데이터 확인하기'}</button>
		</form>
	{/snippet}

	{#if recs.length}
		<div class="sec" style="margin-top:20px">
			{g.brand.name} 맞춤 추천 <span class="console-sec-sub">— 카테고리 적합 · 매출 효율</span>
		</div>
		<div class="listcard console-rows">
			{#each recs as row (row.id)}
				<div class="rowitem">
					<SellerAvatar avatarUrl={row.avatarUrl} size={40} />
					<div class="grow">
						<div class="nm">
							<GradeBox grade={row.grade} sm />
							{row.name}
							{#if row.handle}<span class="sub"><PlatformHandle platform={row.platform} handle={row.handle} /></span>{/if}
						</div>
						<div class="meta">✦ {recommendReason(row, g.brand.category, fmtNum)}</div>
					</div>
					<div class="rowacts">
						<a href="{data.productsPath}" class="btn ghost sm">제안할 상품 →</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="sec" style="margin-top:20px">
		전체 인플루언서 <span class="console-sec-sub">— {rows.length}명</span>
	</div>
	{#if rows.length}
		<div class="gal-grid">
			{#each rows as row (row.id)}
				<section class="card static gal-card">
					<div class="gal-head">
						<SellerAvatar avatarUrl={row.avatarUrl} size={44} />
						<div class="grow">
							<div class="nm">
								<GradeBox grade={row.grade} sm />
								{row.name}
								{#if row.handle}<span class="sub"><PlatformHandle platform={row.platform} handle={row.handle} /></span>{/if}
								{#if freeReasonBadge(row.freeReason)}<span class="chip plat">{freeReasonBadge(row.freeReason)}</span>{/if}
							</div>
							<div class="meta">
								{row.category ?? '-'} · 팔로워 {fmtNum(row.followers ?? 0)}{#if row.intro} · {row.intro}{/if}
							</div>
						</div>
					</div>
					{#if row.unlocked}
						{@render statRow(row)}
					{:else}
						<div class="gal-locked">
							<p class="meta">3개월 매출 · 판매당 평균 · 참여율 · 최근 반응 · 외부 판매 예상 — 잠김</p>
							{@render unlockForm(row.id, 'data', row.priceCel, row.name)}
						</div>
					{/if}
					<div class="btnrow" style="margin-top:12px">
						<a href={data.productsPath} class="btn ghost sm">판매 직접 제안</a>
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="listcard"><div class="empty" style="padding:24px">{GALLERY_EMPTY}</div></div>
	{/if}

	{#if scout.length}
		<div class="sec" style="margin-top:22px">
			익명 인플루언서 스카우트 <span class="console-sec-sub">— 유료 레퍼런스</span>
		</div>
		<p class="meta" style="margin:-2px 3px 12px">{SCOUT_NOTE}</p>
		<div class="gal-grid">
			{#each scout as s (s.id)}
				<section class="card static gal-card">
					<div class="nm">
						<GradeBox grade={s.grade} sm />
						<b>{scoutLabel(s)}</b>
						{#if s.handle}<span class="sub"><PlatformHandle platform={s.platform} handle={s.handle} /></span>{/if}
						<span class="meta">{s.category ?? '-'} 주력</span>
					</div>
					<div class="gal-m3">
						₩{fmtNum(s.m3Sales)} <span class="meta">최근 3개월 매출</span>
					</div>
					{#if s.unlocked && s.stats}
						<div class="meta">
							팔로워 {fmtNum(s.stats.followers ?? 0)} · 좋아요 평균 {fmtNum(s.stats.likesAvg ?? 0)}
							{#if s.stats.engagement !== null} · 참여율 {s.stats.engagement}%{/if}
							{#if s.stats.perFollower !== null} · 매출/팔로워 ₩{fmtNum(s.stats.perFollower)}{/if}
						</div>
						<!-- 열람했으므로 이제 상품별 초대 후보에 "비공개 · 열람함" 으로 나타난다(0036) -->
						<div class="btnrow" style="margin-top:12px">
							<a href={data.productsPath} class="btn ghost sm">상품 골라 제안하기 →</a>
						</div>
					{:else}
						<p class="meta">팔로워 ●●●,●●● · 좋아요 평균 ●,●●● — 상세 지표 잠김</p>
						{@render unlockForm(s.id, 'ref', s.priceCel, null)}
					{/if}
				</section>
			{/each}
		</div>
		<p class="meta" style="margin-top:12px">
			※ 제안은 인플루언서가 수락해야 진행됩니다(수락 대기 → 샘플 발송).
		</p>
	{/if}
{/if}
