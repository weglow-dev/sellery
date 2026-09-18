"use client";

/**
 * 인증 띠 `.store-trust` (ux-spec §3.1.1 ② 원문). 클릭 → 인증 확인 모달 (§4.1). 소유: C.
 *   {CEL} **셀러리 인증 판매** · 결제 보관 · {clear_days}일 환불 보호 · 인플루언서 채널 인증 ✓ … 우측 끝 밑줄 `인증 확인`
 */
import { CEL } from "@/components/icons";
import { VerifyLauncher } from "@/components/verify-modal";
import type { CampaignCard } from "@/lib/campaign";

export function TrustBand({ card }: { card: CampaignCard }) {
  return (
    <VerifyLauncher as="div" code={card.campaign.code} card={card} className="store-trust">
      <CEL /> <b>셀러리 인증 판매</b> · 결제 보관 · {card.settings.clear_days}일 환불 보호 · 인플루언서 채널 인증 ✓
      <span className="verify">인증 확인</span>
    </VerifyLauncher>
  );
}
