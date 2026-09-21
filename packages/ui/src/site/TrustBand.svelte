<script lang="ts">
	/**
	 * 인증 띠 `.store-trust` (ux-spec §3.1.1 ② 원문 · web trust-band.tsx). 클릭 → 인증 확인 모달 (§4.1).
	 *   {CEL} **셀러리 인증 판매** · 결제 보관 · {clear_days}일 환불 보호 · 인플루언서 채널 인증 ✓ … 우측 끝 밑줄 `인증 확인`
	 */
	import type { CampaignCard } from '@sellery/db/campaign';
	import Cel from './icons/Cel.svelte';
	import VerifyLauncher from './VerifyLauncher.svelte';
	let { card }: { card: CampaignCard } = $props();
</script>

<VerifyLauncher as="div" code={card.campaign.code} {card} class="store-trust">
	<Cel /> <b>셀러리 인증 판매</b> · 결제 보관 · {card.settings.clear_days}일 환불 보호 · 인플루언서 채널 인증 ✓
	<span class="verify">인증 확인</span>
</VerifyLauncher>
