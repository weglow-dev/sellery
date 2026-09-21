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
				<td>{brand.name} <GradeBox grade={brand.grade} sm />{#if !brand.biz_no}{' · 인증 브랜드'}{/if}</td>
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
