/**
 * 고객 사이트 `/influencers` 인플루언서 목록 — 순수부 (프로토타입 js/60-customer.js vCustInfluencers · docs/app-plan.md §6.1).
 * 조회는 `./server/campaign.server.ts` fetchPublicSellerProfiles, 여기는 필터·집계만 (브라우저·vitest 에서도 import 가능).
 *
 * 링크 보호(app-plan §8): 목록은 프로토타입대로 공개 인플루언서 전원을 보여 주고, 캠페인 건수·LIVE 링크에만 custVisible 을 건다
 * (홈의 우측 "인플루언서" 칩과 같은 규칙 — 보호 중에도 인플루언서 자체는 숨기지 않는다).
 */
import type { HomeCard } from "./campaign";
import { custVisible, type LinkCtx } from "./linkctx";

/** 메인 채널 플랫폼 (0001 sellers.platform check) — `?platform=` 필터 키 */
export const SELLER_PLATFORMS = ["instagram", "youtube", "naver", "tiktok"] as const;
export type SellerPlatform = (typeof SELLER_PLATFORMS)[number];

export function isSellerPlatform(v: string | null | undefined): v is SellerPlatform {
  return (SELLER_PLATFORMS as readonly string[]).includes(v ?? "");
}

/** sellers 공개 컬럼(0001 grant) + 인증된 메인 채널 존재 — fetchPublicSellerProfiles 결과 행 */
export type SellerProfile = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string;
  avatar_url: string | null;
  followers: number;
  category: string | null;
  intro: string | null;
  grade: string | null;
};

export type SellerListFilter = { platform: SellerPlatform | null; cat: string | null };

/** `?platform=` `?cat=` 필터 — 모르는 값은 무시(전체) */
export function filterSellers<T extends Pick<SellerProfile, "platform" | "category">>(list: T[], f: SellerListFilter): T[] {
  return list.filter((s) => (!f.platform || s.platform === f.platform) && (!f.cat || f.cat === "전체" || s.category === f.cat));
}

export type SellerCampaignStats = {
  /** LIVE */
  live: number;
  /** SCHEDULE_CONFIRMED */
  soon: number;
  /** CLEARING (홈 조회 범위 — SETTLED 는 조회하지 않으므로 포함되지 않는다) */
  done: number;
  /** LIVE 캠페인 링크 재료 — 판매 페이지 `/s/{handle}/{code}` (storeUrl) */
  liveCards: HomeCard[];
};

/** 인플루언서 한 명의 캠페인 집계 — 링크 보호 중이면 custVisible 을 통과한 캠페인만 센다 (프로토타입 vCustInfluencers 와 동일) */
export function sellerCampaignStats(cards: HomeCard[], sellerId: string, L: LinkCtx | null): SellerCampaignStats {
  const mine = cards.filter(
    (c) => c.seller_id === sellerId && custVisible({ seller_id: c.seller_id, product_id: c.product_id, category: c.product.category }, L),
  );
  return {
    live: mine.filter((c) => c.status === "LIVE").length,
    soon: mine.filter((c) => c.status === "SCHEDULE_CONFIRMED").length,
    done: mine.filter((c) => c.status === "CLEARING").length,
    liveCards: mine.filter((c) => c.status === "LIVE"),
  };
}

/** 칩 건수 — 플랫폼별 · 카테고리별 (현재 다른 축의 필터는 적용하지 않는다: 홈 카테고리 칩과 같은 "전체 기준" 건수) */
export function sellerCounts<T extends Pick<SellerProfile, "platform" | "category">>(list: T[]): { platform: Record<string, number>; cat: Record<string, number> } {
  const platform: Record<string, number> = {};
  const cat: Record<string, number> = {};
  for (const s of list) {
    platform[s.platform] = (platform[s.platform] ?? 0) + 1;
    if (s.category) cat[s.category] = (cat[s.category] ?? 0) + 1;
  }
  return { platform, cat };
}
