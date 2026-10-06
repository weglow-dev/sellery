/**
 * 셀러리 샵 규칙(`shop/shop-rules.ts`) 테스트 — 파서 · 버튼 분기 · 남은 일수 · 문구.
 * 카탈로그·가격·효과는 DB(0037)가 다루므로 여기서는 검증하지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  SHOP_FAIL_MESSAGES,
  daysLeft,
  earnRuleLine,
  ledgerLabel,
  parseShop,
  parseShopBuy,
  priceLabel,
  shopBuyMessage,
  shopButton,
  type ShopItem,
} from "../shop/shop-rules";

function item(over: Partial<ShopItem> = {}): ShopItem {
  return {
    id: "featured",
    name: "프로필 상단 노출 (7일)",
    desc: "브랜드 갤러리 추천 최상단",
    price: 3,
    days: 7,
    auto: false,
    active: false,
    expiresOn: null,
    available: true,
    ...over,
  };
}

describe("parseShop", () => {
  const payload = {
    ok: true,
    balance: 21,
    paid_balance: 0,
    free_balance: 21,
    today: "2026-10-06",
    items: [
      { id: "featured", name: "프로필 상단 노출 (7일)", desc: "…", price: 3, days: 7, auto: false, active: false, available: true },
      { id: "samplepay", name: "샘플 구매 셀러리 결제", price: null, auto: true, active: false, available: true },
      { id: "regongu", name: "재판매 우선권 (30일)", price: 2, days: 30, auto: false, active: false, available: false },
    ],
    ledger: [{ delta: -3, reason: "shop_item", memo: "프로필 상단 노출 (7일) 구매", created_at: "2026-10-06T00:00:00Z" }],
  };

  it("잔액·카탈로그·원장을 좁힌다", () => {
    const s = parseShop(payload)!;
    expect(s.balance).toBe(21);
    expect(s.items).toHaveLength(3);
    expect(s.ledger[0].delta).toBe(-3);
  });

  it("충전을 도입하지 않았으므로 paidBalance 는 0 (0034)", () => {
    expect(parseShop(payload)!.paidBalance).toBe(0);
  });

  it("price 는 숫자와 문자열 모두 받는다 — 'grade'(등급별)", () => {
    const s = parseShop({ ...payload, items: [{ id: "ref", price: "grade", auto: true }] })!;
    expect(s.items[0].price).toBe("grade");
  });

  it("id 가 없는 행은 버린다", () => {
    const s = parseShop({ ...payload, items: [{ name: "이름만" }, { id: "ok" }] })!;
    expect(s.items.map((i) => i.id)).toEqual(["ok"]);
  });

  it("ok 가 아니면 null · 목록이 없으면 빈 배열", () => {
    expect(parseShop({ ok: false })).toBeNull();
    expect(parseShop(null)).toBeNull();
    const s = parseShop({ ok: true })!;
    expect(s.items).toEqual([]);
    expect(s.ledger).toEqual([]);
  });
});

describe("shopButton — 프로토타입 Shop.svelte 분기 순서", () => {
  it("자동 차감 아이템은 버튼이 없다", () => {
    expect(shopButton(item({ auto: true }), 100, "2026-10-06")).toEqual({ kind: "auto", label: "사용 시 자동 차감" });
  });

  it("보유 중이면 남은 일수를 보여준다", () => {
    const b = shopButton(item({ active: true, expiresOn: "2026-10-13" }), 100, "2026-10-06");
    expect(b.kind).toBe("active");
    expect(b.label).toBe("보유 중 · 7일 남음");
  });

  it("영구형 보유는 일수를 적지 않는다", () => {
    const b = shopButton(item({ active: true, days: null, expiresOn: null }), 100, "2026-10-06");
    expect(b.label).toBe("보유 중");
  });

  it("**효과가 없는 아이템은 '준비 중' 으로 막는다** — 돈 받고 아무 일도 안 하는 걸 방지", () => {
    const b = shopButton(item({ available: false }), 100, "2026-10-06");
    expect(b.kind).toBe("soon");
  });

  it("가격이 숫자가 아니면 구매할 수 없다", () => {
    expect(shopButton(item({ price: "grade" }), 100, "2026-10-06").kind).toBe("soon");
    expect(shopButton(item({ price: null }), 100, "2026-10-06").kind).toBe("soon");
  });

  it("잔액이 모자라면 버튼이 비활성", () => {
    const ok = shopButton(item(), 3, "2026-10-06");
    const no = shopButton(item(), 2, "2026-10-06");
    expect(ok).toMatchObject({ kind: "buy", enabled: true });
    expect(no).toMatchObject({ kind: "buy", enabled: false });
    expect(ok.kind === "buy" && ok.label).toContain("🥬 3");
  });

  it("보유 판정이 available 보다 앞선다 — 이미 산 것은 '준비 중' 으로 덮지 않는다", () => {
    const b = shopButton(item({ active: true, available: false, expiresOn: "2026-10-10" }), 0, "2026-10-06");
    expect(b.kind).toBe("active");
  });
});

describe("daysLeft", () => {
  it("만료일까지 남은 일수", () => {
    expect(daysLeft("2026-10-13", "2026-10-06")).toBe(7);
    expect(daysLeft("2026-10-06", "2026-10-06")).toBe(0);
  });

  it("지난 날짜는 0 — 음수를 보여주지 않는다", () => {
    expect(daysLeft("2026-10-01", "2026-10-06")).toBe(0);
  });

  it("값이 없거나 깨지면 null", () => {
    expect(daysLeft(null, "2026-10-06")).toBeNull();
    expect(daysLeft("2026-10-13", null)).toBeNull();
    expect(daysLeft("언제", "2026-10-06")).toBeNull();
  });
});

describe("parseShopBuy · shopBuyMessage", () => {
  it("구매 성공 — 적용 건수를 알려준다", () => {
    const r = parseShopBuy({ ok: true, already: false, item_id: "homefeature", name: "고객 홈 상단 노출 (7일)", charged: 5, balance: 13, expires_on: "2026-10-13", applied: 4 });
    expect(r).toMatchObject({ ok: true, charged: 5, applied: 4 });
    const msg = shopBuyMessage(r);
    expect(msg).toContain("고객 홈 상단 노출");
    expect(msg).toContain("−🥬 5");
    expect(msg).toContain("4건에 적용");
  });

  it("멱등 — 이미 보유", () => {
    expect(shopBuyMessage(parseShopBuy({ ok: true, already: true, code: "ALREADY" }))).toContain("이미 보유");
  });

  it("적용 대상이 없으면 차감하지 않았다고 알린다 (프로토타입과 같다)", () => {
    const r = parseShopBuy({ ok: false, code: "NO_TARGET_CAMPAIGN" });
    expect(shopBuyMessage(r)).toContain("차감되지 않았어요");
  });

  it("잔액 부족 · 준비 중 · 자동 아이템", () => {
    expect(shopBuyMessage(parseShopBuy({ ok: false, code: "CEL_INSUFFICIENT", price_cel: 3 }))).toContain("부족");
    expect(shopBuyMessage(parseShopBuy({ ok: false, code: "NOT_AVAILABLE" }))).toContain("준비 중");
    expect(shopBuyMessage(parseShopBuy({ ok: false, code: "AUTO_ITEM" }))).toContain("자동");
  });

  it("모르는 코드는 기본 문구", () => {
    expect(shopBuyMessage(parseShopBuy({ ok: false, code: "WAT" }))).toBe(SHOP_FAIL_MESSAGES.ERROR);
  });
});

describe("priceLabel", () => {
  it("숫자는 🥬 N", () => {
    expect(priceLabel(item({ price: 3 }))).toBe("🥬 3");
  });

  it("등급별은 범위로 — DB 는 'grade' 만 들고 있다", () => {
    expect(priceLabel(item({ id: "ref", price: "grade" }))).toContain("1–5");
  });

  it("샘플 결제는 환산율 — 가격이 아니다", () => {
    expect(priceLabel(item({ id: "samplepay", price: null }))).toContain("₩20,000");
  });

  it("그 밖에 가격이 없으면 '사용 시 차감'", () => {
    expect(priceLabel(item({ id: "wat", price: null }))).toBe("사용 시 차감");
  });
});

describe("문구", () => {
  it("획득 규칙은 CELERY_PER 를 쓴다", () => {
    expect(earnRuleLine()).toContain("500만");
    expect(earnRuleLine()).toContain("1🥬");
  });

  it("원장 라벨 — memo 우선, 없으면 사유 라벨", () => {
    expect(ledgerLabel({ delta: -3, reason: "shop_item", memo: "프로필 상단 노출 구매", createdAt: null })).toBe("프로필 상단 노출 구매");
    expect(ledgerLabel({ delta: 1, reason: "earned", memo: null, createdAt: null })).toBe("확정 매출 적립");
    expect(ledgerLabel({ delta: 1, reason: "wat", memo: null, createdAt: null })).toBe("셀러리 변동");
  });
});
