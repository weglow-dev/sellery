<script lang="ts">
	/**
	 * 콘솔 홈 — web influencer/home/page.tsx 1:1: 상단 활동명·등급·🥬 잔액 + "지금 할 일" 카드 3장 —
	 * 채널 인증(/my) · 계좌 등록(5단계 예고 · 비활성) · 상품 둘러보기(3단계 예고 · 비활성).
	 */
	import { consolePath } from '@sellery/db/console-paths';
	import { GradeBox, PlatformHandle } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const seller = $derived(data.seller);
</script>

<svelte:head>
	<title>홈 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>{seller.name} 님, 안녕하세요</h2>
	<GradeBox grade={seller.grade} sm />
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<section class="card static" style="margin-bottom:16px">
	<div class="lbl-sm">내 계정</div>
	<p class="meta" style="margin-top:6px">
		<PlatformHandle platform={seller.platform} handle={seller.handle} /> · 등급 <b>{seller.grade ?? '스타터'}</b> · 🥬 <b>{data.balance}</b>{#if seller.code}
			· 코드 <b>{seller.code}</b>{/if}
	</p>
	<p class="meta">등급은 최근 3개월 확정 매출로 매달 다시 계산되고, 🥬 는 확정 매출 ₩500만당 1개씩 쌓여요.</p>
</section>

<div class="sec">지금 할 일</div>
<div class="console-todo">
	<section class="card static">
		<h4>① 채널 인증</h4>
		<p class="meta">가입 때 등록한 {seller.handle} 채널을 인증하면 브랜드 갤러리에 노출돼요. 1회용 코드를 프로필이나 DM 으로 보내면 돼요.</p>
		<a href={consolePath('seller', '/my')} class="btn pri sm">인증하러 가기 →</a>
	</section>
	<section class="card static">
		<h4>② 정산 계좌 등록</h4>
		<p class="meta">
			{seller.has_bank_info ? '정산 정보가 등록돼 있어요.' : '정산 정보가 없으면 D+21 지급이 보류돼요.'} 계좌·원천징수 자료 입력은 <b>5단계</b>에서 열립니다.
		</p>
		<button type="button" class="ghost sm" disabled aria-disabled="true">준비 중</button>
	</section>
	<section class="card static">
		<h4>③ 첫 상품 둘러보기</h4>
		<p class="meta">브랜드 상품 갤러리에서 무상 샘플을 요청하거나 샘플을 구매해 첫 캠페인을 시작해요. 상품 갤러리는 <b>3단계</b>에서 열립니다.</p>
		<button type="button" class="ghost sm" disabled aria-disabled="true">준비 중</button>
	</section>
</div>
