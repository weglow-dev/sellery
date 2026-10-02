<script lang="ts">
	/** 3.1.7 브랜드 사업자 정보 카드 [신규] — biz_no · mail_order_no 가 null 이면 행 생략 (web s/[handle]/[code]/page.tsx SellerInfoCard) */
	import type { CampaignCard } from '@sellery/db/campaign';
	import { COMPANY } from '@sellery/db/company';
	import PlatIcon from './icons/PlatIcon.svelte';
	import GradeBox from './GradeBox.svelte';
	let { card }: { card: CampaignCard } = $props();
	const brand = $derived(card.brand);
	const seller = $derived(card.seller);
</script>

<div class="card">
	<h4>판매자 정보</h4>
	<table class="stmt" style="min-width:0;font-size:13px">
		<tbody>
			<tr>
				<td style="white-space:nowrap">공급 브랜드</td>
				<!--
					사업자번호가 없을 때 붙던 ' · 인증 브랜드' 대체 문구를 제거했다(2026-10-02).
					프로토타입(`VerifyStoreModal.svelte:15`)의 자리표시 문구였는데 고객에게는 **심사를 통과한 브랜드**로
					읽힌다 — 정작 사업자번호가 없는(= 검증이 덜 된) 브랜드에만 붙으므로 방향이 거꾸로였다.
					`docs/grade-policy.md:143` 도 "인증 뱃지가 아니며 등급과 무관" 으로 분석해 뒀다.
					브랜드 가입 시 사업자번호는 필수(`brand/signup-rules.ts:96` · 0014)라 정상 경로에서는 비지 않는다.
				-->
				<td>{brand.name} <GradeBox grade={brand.grade} sm /></td>
			</tr>
			{#if brand.biz_no}
				<tr>
					<td style="white-space:nowrap">사업자등록번호</td>
					<td>{brand.biz_no}</td>
				</tr>
			{/if}
			{#if brand.mail_order_no}
				<tr>
					<td style="white-space:nowrap">통신판매업신고</td>
					<td>{brand.mail_order_no}</td>
				</tr>
			{/if}
			<tr>
				<td style="white-space:nowrap">판매 인플루언서</td>
				<td>{seller.name} <PlatIcon platform={seller.platform} /> {seller.handle} · 셀러리 인증</td>
			</tr>
			<tr>
				<td style="white-space:nowrap">통신판매중개</td>
				<td>{COMPANY.name} · 셀러리 — 사업자 정보는 페이지 하단 참조</td>
			</tr>
		</tbody>
	</table>
</div>
