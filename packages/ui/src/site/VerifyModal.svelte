<script lang="ts">
	/**
	 * 인증 확인 모달 (프로토타입 js/80-actions.js verifyStore · ux-spec §4.1 · web verify-modal.tsx VerifyModal).
	 * campaign_card 데이터로 표를 렌더 (링크 페이지는 서버가 넘긴 card 를 그대로). `유효` 판정 = RPC 응답이 null 이 아님 (SETTLED 도 유효).
	 * 기존 `modals/VerifyModal.svelte`(채널 인증 데모) 와 이름이 겹쳐 site/index.ts 는 `SiteVerifyModal` 로 내보낸다.
	 */
	import { displayStoreUrl, type CampaignCard } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import Modal from './Modal.svelte';
	import Cel from './icons/Cel.svelte';
	import PlatIcon from './icons/PlatIcon.svelte';
	import GradeBox from './GradeBox.svelte';
	import StatusChip from './StatusChip.svelte';
	let { card, open, onClose }: { card: CampaignCard | null; open: boolean; onClose: () => void } = $props();
</script>

{#if card}
	{@const { campaign, seller, brand, channels, settings } = card}
	<Modal {open} {onClose}>
		{#snippet title()}<Cel /> 셀러리 판매 인증{/snippet}
		<div class="notice" style="margin:8px 0 12px">이 판매 페이지는 셀러리가 발급한 정식 링크입니다. 사칭 링크는 이 인증 정보를 표시할 수 없습니다.</div>
		<table class="stmt" style="min-width:0;font-size:13px">
			<tbody>
				<tr>
					<td>인증 링크</td>
					<td class="num" style="white-space:normal">{displayStoreUrl(card)} <StatusChip tone="green" class="verify-chip">유효</StatusChip></td>
				</tr>
				<tr>
					<td>판매 인플루언서</td>
					<td class="num" style="white-space:normal"><PlatIcon platform={seller.platform} /> {seller.name} {seller.handle} · <GradeBox grade={seller.grade} sm /></td>
				</tr>
				<tr>
					<td>인증 채널</td>
					<td class="num" style="white-space:normal">
						{#each channels as ch, i (`${ch.platform}:${ch.handle}`)}<span>{#if i > 0}<br />{/if}<PlatIcon platform={ch.platform} /> {ch.handle} ✓</span>{:else}—{/each}
					</td>
				</tr>
				<tr>
					<td>공급 브랜드</td>
					<td class="num" style="white-space:normal">{brand.name} · <GradeBox grade={brand.grade} sm />{brand.biz_no ? ` · 사업자 ${brand.biz_no}` : ' · 인증 브랜드'}</td>
				</tr>
				<tr>
					<td>판매 기간</td>
					<td class="num">{campaign.start_date && campaign.end_date ? `${md(campaign.start_date)} – ${md(campaign.end_date)}` : '—'}</td>
				</tr>
				<tr>
					<td>결제·정산</td>
					<td class="num" style="white-space:normal">셀러리 에스크로 보관 · 종료 후 {settings.clear_days}일 환불 보호</td>
				</tr>
			</tbody>
		</table>
		{#snippet footer()}<button type="button" class="pri" onclick={onClose}>닫기</button>{/snippet}
	</Modal>
{/if}
