// /influencers 순수부 — filterSellers · sellerCampaignStats(링크 보호) · sellerCounts · isSellerPlatform (docs/app-plan.md §6.1 · §8)
import { describe, expect, it } from "vitest";
import type { HomeCard } from "../campaign";
import type { LinkCtx } from "../linkctx";
import { filterSellers, isSellerPlatform, sellerCampaignStats, sellerCounts } from "../sellers";

const sellers = [
  { id: "s1", platform: "instagram", category: "이너뷰티·피부" },
  { id: "s2", platform: "instagram", category: "웰니스 푸드" },
  { id: "s3", platform: "naver", category: "다이어트·체형" },
  { id: "s6", platform: "instagram", category: null },
];

function card(over: Partial<HomeCard> & { category?: string }): HomeCard {
  const { category = "이너뷰티·피부", ...rest } = over;
  return {
    id: rest.id ?? "c",
    code: rest.code ?? "c",
    status: rest.status ?? "LIVE",
    start_date: null,
    end_date: null,
    qty: 100,
    sold_qty: 0,
    home_featured_at: null,
    seller_id: rest.seller_id ?? "s1",
    product_id: rest.product_id ?? "p1",
    brand_id: "b1",
    product: { id: rest.product_id ?? "p1", name: "상품", description: null, emoji: "🥬", thumb_url: null, category, consumer_price: 0, sale_price: 0 },
    seller: { id: rest.seller_id ?? "s1", code: null, name: "n", handle: "@h", platform: "instagram", avatar_url: null, grade: null },
    brand: { id: "b1", name: "b" },
  };
}

describe("isSellerPlatform", () => {
  it("네 플랫폼만", () => {
    expect(isSellerPlatform("instagram")).toBe(true);
    expect(isSellerPlatform("tiktok")).toBe(true);
    expect(isSellerPlatform("facebook")).toBe(false);
    expect(isSellerPlatform(null)).toBe(false);
  });
});

describe("filterSellers", () => {
  it("필터 없음 · '전체' 는 전부", () => {
    expect(filterSellers(sellers, { platform: null, cat: null })).toHaveLength(4);
    expect(filterSellers(sellers, { platform: null, cat: "전체" })).toHaveLength(4);
  });
  it("플랫폼 · 카테고리 AND", () => {
    expect(filterSellers(sellers, { platform: "instagram", cat: null }).map((s) => s.id)).toEqual(["s1", "s2", "s6"]);
    expect(filterSellers(sellers, { platform: "instagram", cat: "웰니스 푸드" }).map((s) => s.id)).toEqual(["s2"]);
    expect(filterSellers(sellers, { platform: "naver", cat: "웰니스 푸드" })).toEqual([]);
  });
  it("category null 인 인플루언서는 카테고리 필터에서 빠진다", () => {
    expect(filterSellers(sellers, { platform: null, cat: "이너뷰티·피부" }).map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("sellerCampaignStats", () => {
  const cards = [
    card({ id: "c1", code: "c1", seller_id: "s1", product_id: "p1", status: "LIVE" }),
    card({ id: "c2", code: "c2", seller_id: "s1", product_id: "p2", status: "SCHEDULE_CONFIRMED" }),
    card({ id: "c3", code: "c3", seller_id: "s1", product_id: "p3", status: "CLEARING", category: "웰니스 푸드" }),
    card({ id: "c4", code: "c4", seller_id: "s2", product_id: "p1", status: "LIVE" }),
    card({ id: "c5", code: "c5", seller_id: "s2", product_id: "p9", status: "LIVE", category: "다이어트·체형" }),
  ];
  it("보호 없음: 본인 캠페인 전부", () => {
    const st = sellerCampaignStats(cards, "s1", null);
    expect([st.live, st.soon, st.done]).toEqual([1, 1, 1]);
    expect(st.liveCards.map((c) => c.code)).toEqual(["c1"]);
    expect(sellerCampaignStats(cards, "s2", null).live).toBe(2);
    expect(sellerCampaignStats(cards, "s9", null)).toEqual({ live: 0, soon: 0, done: 0, liveCards: [] });
  });
  it("링크 보호 중: 링크 인플루언서는 전부, 타 인플루언서는 같은 상품·카테고리 제외", () => {
    const L: LinkCtx = { code: "c1", sellerId: "s1", productId: "p1", category: "이너뷰티·피부", sellerName: "지유" };
    expect(sellerCampaignStats(cards, "s1", L).live).toBe(1);
    const s2 = sellerCampaignStats(cards, "s2", L);
    expect(s2.live).toBe(1); // c4(같은 상품 p1) 제외, c5(다른 카테고리) 만
    expect(s2.liveCards.map((c) => c.code)).toEqual(["c5"]);
  });
});

describe("sellerCounts", () => {
  it("플랫폼 · 카테고리 건수 (category null 은 카테고리 집계에서 제외)", () => {
    expect(sellerCounts(sellers)).toEqual({
      platform: { instagram: 3, naver: 1 },
      cat: { "이너뷰티·피부": 1, "웰니스 푸드": 1, "다이어트·체형": 1 },
    });
  });
});
