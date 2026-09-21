<script lang="ts">
	/**
	 * 인플루언서 직접 제안 — 프로토타입 inviteModal(제안 상품 · 메시지) + 갤러리 sellerCard(등급 · 플랫폼 · 핸들 · 팔로워 · 카테고리 적합)를 폼 하나로.
	 * 후보 카드 = 라디오(name=seller_id) — 검색은 이름·핸들 부분 일치(matchesCandidateQuery · JS 없이는 전체 목록). 다이아·블랙은 후보에 없고(0017 게이트) 하단 안내만.
	 * 실패한 제출은 `form`(fail 400)으로 선택·메시지 유지 · ALREADY_ACTIVE 는 진행 중 캠페인 링크.
	 */
	import { fmtNum } from '@sellery/db/campaign';
	import { INVITE_GATED_NOTICE, INVITE_MESSAGE_MAX, matchesCandidateQuery } from '@sellery/db/brand/invite-rules';
	import { GradeBox, PlatformHandle, ProductIcon, SellerAvatar, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.product);
	const pct = (r: number) => (r * 100).toFixed(0);
	let q = $state('');
	const shown = $derived(data.candidates.filter((c) => matchesCandidateQuery(c, q)));
	const selected = $derived(form?.values?.seller_id ?? '');
	const PLATFORM_LABEL: Record<string, string> = { instagram: '인스타그램', youtube: '유튜브', tiktok: '틱톡', naver: '네이버 블로그' };
</script>

<svelte:head>
	<title>{p.name} 인플루언서 제안 — 셀러리 파트너</title>
</svelte:head>

<a href={data.productHref} class="btn ghost sm" style="margin:0 3px 12px">← {p.name}</a>

<section class="card static console-det">
	<ProductIcon thumbUrl={p.thumb_url} emoji={p.emoji} size={52} />
	<div class="grow">
		<div class="t">인플루언서 직접 제안 <small>· {p.code.toUpperCase()}</small></div>
		<div class="meta">
			<b>{p.name}</b> · {p.category} · 판매가 ₩{fmtNum(p.sale_price)} · 수수료 {pct(p.commission_rate)}% <StatusChip tone={p.chip.tone}>{p.chip.label}</StatusChip>
		</div>
		<p class="hint" style="margin:8px 0 0;font-size:12.5px;color:var(--color-mute)">제안을 받은 인플루언서가 수락하면 샘플 요청·승인 없이 바로 샘플 발송 단계로 넘어가요(무상 · 인플루언서 월 한도 미차감). 거절하면 캠페인이 종료됩니다.</p>
	</div>
</section>

{#if !p.listed}
	<div class="card static" style="margin-top:14px">
		<div class="empty" style="padding:18px">
			노출 중인 상품만 제안할 수 있어요 — 지금은 <b>{p.chip.label}</b> 상태예요.
			<div class="meta" style="margin-top:8px">{p.status === 'pending' ? '운영팀 검수가 끝나면 노출되고 제안을 보낼 수 있어요.' : p.status === 'paused' ? '상품 관리에서 노출을 다시 켜주세요.' : '상품을 수정해 다시 검수를 요청하세요.'}</div>
			<div style="margin-top:12px"><a href={data.productHref} class="btn sm ghost">상품으로 돌아가기</a></div>
		</div>
	</div>
{:else}
	<form method="post" action="?/invite" class="card static console-form console-invite" style="margin-top:14px">
		<input type="hidden" name="product_id" value={p.id} />
		{#if form?.message}
			<p class="notice danger" role="alert">
				{form.message}{#if form.campaignHref}{' '}<a href={form.campaignHref}>진행 중인 캠페인 보기 →</a>{/if}
			</p>
		{/if}

		<div class="sec" style="margin-top:0">제안할 인플루언서 <span class="console-sec-sub">— {data.candidates.length}명 · 팔로워순 · 공개 프로필 · 인증 채널 · 이 상품 진행 중이 아닌 분만</span></div>
		{#if data.candidates.length > 6}
			<div class="fld console-search">
				<label for="inv-q">검색</label>
				<input id="inv-q" type="search" bind:value={q} placeholder="이름 · 핸들" autocomplete="off" />
			</div>
		{/if}
		<div class="console-cands" class:invalid={form?.field === 'seller_id'} role="radiogroup" aria-label="인플루언서 선택">
			{#each shown as c (c.id)}
				{@const ch = c.primary_channel}
				<label class="console-cand">
					<input type="radio" name="seller_id" value={c.id} checked={selected === c.id} required />
					<SellerAvatar avatarUrl={c.avatar_url} size={40} />
					<div class="grow">
						<div class="nm">
							<GradeBox grade={c.grade} sm />
							{c.name}
							<span class="sub"><PlatformHandle platform={c.platform} handle={c.handle} /></span>
							<span class="fit" class:no={!c.category_fit} title={c.category_fit ? '상품 카테고리와 같은 그룹' : '다른 카테고리 주력'}>{c.category_fit ? '카테고리 적합' : c.category ?? '카테고리 미정'}</span>
						</div>
						<div class="sub">
							<span>{PLATFORM_LABEL[c.platform] ?? c.platform}</span>
							<span>팔로워 {fmtNum(c.followers)}{#if ch && ch.followers && ch.followers !== c.followers}{' '}(채널 {fmtNum(ch.followers)}){/if}</span>
							{#if ch?.verified}<span>✓ 인증 채널</span>{/if}
							{#if c.category && c.category_fit}<span>{c.category} 주력</span>{/if}
						</div>
					</div>
				</label>
			{:else}
				<div class="empty" style="grid-column:1/-1;padding:18px">
					{#if data.candidates.length}
						검색 결과가 없어요 — 다른 이름이나 핸들로 찾아보세요.
					{:else if p.exclusive_seller_id}
						이 상품은 독점 인플루언서가 확정돼 있어 그 인플루언서에게만 제안할 수 있고, 지금은 진행 중이라 새로 제안할 대상이 없어요.
					{:else}
						지금 제안할 수 있는 인플루언서가 없어요.
						<div class="meta" style="margin-top:8px">공개 프로필 · 인증된 메인 채널 · 이 상품을 진행 중이 아닌 인플루언서만 후보가 돼요. 인플루언서가 늘어나면 여기에 나타납니다.</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if form?.field === 'seller_id'}<div class="console-err" role="alert">{form.message}</div>{/if}
		<p class="hint" style="font-size:12px;color:var(--color-mute);margin:0 3px 12px">{INVITE_GATED_NOTICE} · 익명(비공개) 인플루언서는 레퍼런스 열람 뒤에 제안할 수 있어요(다음 단계).</p>

		<div class="fld" class:invalid={form?.field === 'message'}>
			<label for="inv-msg">제안 메시지 <span class="font-normal">(선택 · 스레드의 첫 메시지로 전달돼요 · {INVITE_MESSAGE_MAX}자 이내)</span></label>
			<textarea id="inv-msg" name="message" rows="3" maxlength={INVITE_MESSAGE_MAX}>{form?.values?.message ?? data.defaultMessage}</textarea>
			{#if form?.field === 'message'}<div class="console-err" role="alert">{form.message}</div>{/if}
			<div class="hint">연락처 · 카톡 아이디를 적으면 양쪽 스레드에 경고가 남아요 — 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.</div>
		</div>
		<div class="btnrow">
			<button type="submit" class="pri" disabled={!data.candidates.length}>제안 보내기</button>
			<a href={data.productHref} class="btn ghost">취소</a>
		</div>
	</form>
{/if}
