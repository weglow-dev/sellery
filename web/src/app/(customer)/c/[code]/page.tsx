/**
 * 짧은 주소 `/c/[code]` → 정식 주소 308 (app-plan §6.1). 소유: C.
 * 렌더 없음: campaign_card(code) 가 null 이면 notFound() (not-found.tsx 한 번에), 있으면 permanentRedirect(canonicalStoreUrl).
 * route handler + `/s/_/` 2단 리다이렉트 금지 — 여기서 바로 정식 URL('@' 없는 핸들) 로 보낸다.
 */
import { notFound, permanentRedirect } from "next/navigation";
import { fetchCampaignCard } from "@/lib/campaign-server";
import { canonicalStoreUrl } from "@/lib/campaign";

export const dynamic = "force-dynamic";

export default async function ShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const card = await fetchCampaignCard(code);
  if (!card) notFound();
  permanentRedirect(canonicalStoreUrl(card));
}
