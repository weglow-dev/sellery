// 캠페인 순수 규칙 — web/src/lib/campaign.ts 의 동작 (ux-spec §1.6 · §1.8 · §1.11)
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_CODE_RE,
  DEFAULT_SETTINGS,
  badgeTone,
  canonicalStoreUrl,
  ddayLabelFor,
  discountPct,
  displayStoreUrl,
  fmtKR,
  imageSrc,
  isBuyable,
  isHomeFeat,
  normalizeHandle,
  ogImageSrc,
  parseCampaignCard,
  stockLeft,
  storeUrl,
  viewersOf,
  type CampaignCard,
} from "../campaign";

const RAW = {
  campaign: {
    id: "c-uuid",
    code: "c1",
    status: "LIVE",
    start_date: "2026-09-19",
    end_date: "2026-09-23",
    qty: 100,
    sold_qty: 37,
    home_featured_at: null,
    today: "2026-09-21",
  },
  product: {
    id: "p1",
    code: "p1",
    name: "버닝온",
    description: null,
    emoji: "🔥",
    thumb_url: "assets/burningon.webp",
    image_urls: ["a.webp", 3],
    category: "다이어트·체형",
    consumer_price: 39900,
    sale_price: 29900,
    options: [{ n: "1개", price: 29900 }],
    options_raw: null,
    status: "listed",
  },
  seller: { id: "s1", code: "s1", name: "지유", handle: "@Jiyu_Beauty", platform: "instagram", avatar_url: null, grade: "골드" },
  brand: { id: "b1", code: "b1", name: "바인허브", logo_url: null, grade: null, biz_no: null, mail_order_no: null },
  channels: [{ platform: "instagram", handle: "@jiyu_beauty", url: "https://instagram.com/jiyu_beauty" }, { platform: "x" }],
  settings: { clear_days: 21, link_protect_days: 7, home_feature_days: 7 },
};

describe("parseCampaignCard — 런타임 가드", () => {
  it("정상 jsonb → CampaignCard (image_urls 문자열만 · channels 불완전 항목 제외)", () => {
    const card = parseCampaignCard(RAW);
    expect(card).not.toBeNull();
    expect(card!.campaign.code).toBe("c1");
    expect(card!.product.image_urls).toEqual(["a.webp"]);
    expect(card!.channels).toHaveLength(1);
    expect(card!.settings).toEqual({ clear_days: 21, link_protect_days: 7, home_feature_days: 7 });
  });
  it("상태가 공개 4종 밖이거나 옵션이 비면 null", () => {
    expect(parseCampaignCard({ ...RAW, campaign: { ...RAW.campaign, status: "TESTING" } })).toBeNull();
    expect(parseCampaignCard({ ...RAW, product: { ...RAW.product, options: [] } })).toBeNull();
    expect(parseCampaignCard({ ...RAW, campaign: { ...RAW.campaign, today: "9/21" } })).toBeNull();
    expect(parseCampaignCard(null)).toBeNull();
  });
  it("settings 가 비정상이면 기본값", () => {
    const card = parseCampaignCard({ ...RAW, settings: { clear_days: -1 } });
    expect(card!.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe("핸들 · 정식 URL", () => {
  it("normalizeHandle: @ 제거 · 소문자 · 허용 문자만 · 40자 · 2자 미만은 _", () => {
    expect(normalizeHandle("@Jiyu_Beauty")).toBe("jiyu_beauty");
    expect(normalizeHandle("  @@a.b-c!한글 ")).toBe("a.b-c");
    expect(normalizeHandle("x")).toBe("_");
    expect(normalizeHandle("a".repeat(50))).toHaveLength(40);
  });
  it("storeUrl · canonicalStoreUrl · displayStoreUrl", () => {
    expect(storeUrl("@Jiyu_Beauty", "c1")).toBe("/s/jiyu_beauty/c1");
    const card = parseCampaignCard(RAW) as CampaignCard;
    expect(canonicalStoreUrl(card)).toBe("/s/jiyu_beauty/c1");
    expect(displayStoreUrl(card)).toBe("sellery.life/s/jiyu_beauty/c1");
  });
  it("CAMPAIGN_CODE_RE — 링크 쿠키와 같은 규칙", () => {
    expect(CAMPAIGN_CODE_RE.test("c1")).toBe(true);
    expect(CAMPAIGN_CODE_RE.test("C1")).toBe(false);
    expect(CAMPAIGN_CODE_RE.test("")).toBe(false);
  });
});

describe("D-day · 구매 가능 · 재고", () => {
  const live = { status: "LIVE" as const, start_date: "2026-09-19", end_date: "2026-09-23" };
  it("ddayLabelFor", () => {
    expect(ddayLabelFor(live, "2026-09-21")).toBe("D-3 마감");
    expect(ddayLabelFor(live, "2026-09-23")).toBe("오늘 마감");
    expect(ddayLabelFor(live, "2026-09-24")).toBe("판매 종료");
    expect(ddayLabelFor({ ...live, status: "CLEARING" }, "2026-09-21")).toBe("판매 종료");
    expect(ddayLabelFor({ ...live, status: "SCHEDULE_CONFIRMED" }, "2026-09-17")).toBe("오픈 D-2");
    expect(ddayLabelFor({ ...live, status: "SCHEDULE_CONFIRMED" }, "2026-09-19")).toBe("오픈 준비 중");
    expect(ddayLabelFor({ status: "LIVE", start_date: null, end_date: null }, "2026-09-19")).toBe("판매 중");
  });
  it("badgeTone", () => {
    expect(badgeTone("판매 종료")).toBe("end");
    expect(badgeTone("오픈 D-2")).toBe("soon");
    expect(badgeTone("D-3 마감")).toBe("");
  });
  it("stockLeft · isBuyable", () => {
    const card = parseCampaignCard(RAW) as CampaignCard;
    expect(stockLeft(card)).toBe(63);
    expect(isBuyable(card, 2)).toEqual({ ok: true });
    expect(isBuyable(card, 64)).toMatchObject({ ok: false, code: "SOLD_OUT" });
    const ended = { ...card, campaign: { ...card.campaign, today: "2026-09-24" } };
    expect(isBuyable(ended, 1)).toMatchObject({ ok: false, code: "NOT_LIVE" });
    const settled = { ...card, campaign: { ...card.campaign, qty: null } };
    expect(stockLeft(settled)).toBe(0);
  });
  it("isHomeFeat — featured 뒤 home_feature_days 미만", () => {
    expect(isHomeFeat({ home_featured_at: "2026-09-15" }, "2026-09-21")).toBe(true);
    expect(isHomeFeat({ home_featured_at: "2026-09-14" }, "2026-09-21")).toBe(false);
    expect(isHomeFeat({ home_featured_at: null }, "2026-09-21")).toBe(false);
  });
});

describe("포맷 · 이미지 · 보는 중", () => {
  it("discountPct · fmtKR", () => {
    expect(discountPct(39900, 29900)).toBe(25);
    expect(discountPct(29900, 29900)).toBeNull();
    expect(discountPct(0, 1)).toBeNull();
    expect(fmtKR(470_000_000)).toBe("4.7억");
    expect(fmtKR(12_340_000)).toBe("1,234만");
    expect(fmtKR(9_999)).toBe("9,999");
  });
  it("imageSrc — 상대 경로는 / 를 붙이고 data:/절대는 그대로, OG 는 data: 제외", () => {
    expect(imageSrc("assets/x.webp")).toBe("/assets/x.webp");
    expect(imageSrc("./assets/x.webp")).toBe("/assets/x.webp");
    expect(imageSrc("https://cdn/x.webp")).toBe("https://cdn/x.webp");
    expect(imageSrc(null)).toBeNull();
    expect(ogImageSrc("data:image/png;base64,AAA")).toBeNull();
  });
  it("viewersOf — 14~66, 같은 20초 창에서는 같은 값", () => {
    const v = viewersOf("c1", 1_000_000);
    expect(v).toBeGreaterThanOrEqual(14);
    expect(v).toBeLessThanOrEqual(66);
    expect(viewersOf("c1", 1_000_000 + 19_999)).toBe(v);
  });
});
