<script lang="ts">
	/**
	 * 브랜드 콘솔 홈 — 1단계 최소판: 환영 카드(상호 · 카테고리 · 등급 · 🥬) + "다음 할 일" 3장(첫 상품 등록 · 사업자등록증 · 정산 계좌 — 각 단계에서 열림) + 안내.
	 * 프로토타입 브랜드 홈(승인·처리 대기 · 진행 중 판매 카드 · 내 장부 4 KPI · 등급 카드)은 2·5단계에서 `getBrandHomeWidgets` 로 채운다(docs/brand-console-plan.md §5 `/brand/home`).
	 * 데이터는 전부 서버(`requireBrand` 컨텍스트). 클래스는 인플루언서 홈과 같은 site.css `.console-*` · `.listcard` · `.rowitem` · `.mini-stats`.
	 */
	import { GradeBox } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const brand = $derived(data.brand);
	const now = new Date();
	const joined = $derived(new Date(brand.created_at));
</script>

<svelte:head>
	<title>홈 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>{brand.name}, 반가워요.</h2>
	<GradeBox grade={brand.grade} sm />
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>
<p class="meta" style="margin:-8px 3px 14px">
	{brand.category} · 담당 <b>{brand.manager_name ?? '—'}</b> · 브랜드 코드 <b>{brand.code ?? '—'}</b> · 입점 {joined.getFullYear()}.{joined.getMonth() + 1}.{joined.getDate()} · {now.getMonth() + 1}월 {now.getDate()}일
</p>

<div class="sec">다음 할 일 <span class="badge">{data.todos.length}</span></div>
<div class="listcard console-rows">
	{#each data.todos as t (t.kind)}
		<div class="rowitem">
			<span class="plat" aria-hidden="true">{t.icon}</span>
			<div class="grow">
				<div class="nm">{t.title}</div>
				<div class="sub">{t.desc}</div>
			</div>
			<span class="btn ghost sm" aria-disabled="true" title={t.stage}>{t.stage}</span>
		</div>
	{/each}
</div>

<div class="sec" style="margin-top:22px">브랜드 콘솔 준비 중</div>
<div class="card static">
	<p class="meta" style="margin:0">
		입점 신청이 완료됐어요. 지금은 <b>가입 · 로그인 · 홈</b>만 열려 있고, 상품 등록과 샘플 요청 처리(2단계) → 일정 확정 · 인플루언서 초대(3단계) → 주문 · 발주 · 운송장 · 고객 문의(4단계) → 정산 · 등급 · 내 정보(5단계) 순서로 열립니다.
		열리기 전까지 필요한 일(상품 등록 · 정산 정보)은 셀러리 운영팀이 이메일로 대신 받아 처리해 드려요.
	</p>
	<div class="mini-stats" style="margin-top:14px;margin-bottom:0">
		<div><span class="ms-l">브랜드 등급</span><span class="ms-v">{brand.grade ?? '스타터'}</span><span class="ms-s">누적 확정 매출로 매달 재계산</span></div>
		<div><span class="ms-l">셀러리</span><span class="ms-v">🥬 {data.balance}</span><span class="ms-s">입점 이벤트 지급 포함</span></div>
		<div><span class="ms-l">정산 정보</span><span class="ms-v">{brand.has_bank_info ? '등록 완료' : '미등록'}</span><span class="ms-s">{brand.has_biz_doc ? '사업자등록증 있음' : '사업자등록증 없음'}</span></div>
		<div><span class="ms-l">추천 코드</span><span class="ms-v">{brand.ref_code ?? '—'}</span><span class="ms-s">추천 브랜드 첫 3회 판매 1%</span></div>
	</div>
</div>
