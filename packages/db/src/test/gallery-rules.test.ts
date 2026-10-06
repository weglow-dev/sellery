/**
 * 브랜드 갤러리 규칙(`brand/gallery-rules.ts`) 테스트 — 파서 · 익명 계약 · 등급 필터 · 문구.
 * 가격·무료 판정은 DB(0035)가 하므로 여기서는 검증하지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  asFreeReason,
  freeReasonBadge,
  gradeAtLeast,
  parseGallery,
  parseUnlockResult,
  recommendReason,
  scoutLabel,
  unlockMessage,
  type GalleryRow,
} from "../brand/gallery-rules";

const fmt = (n: number) => n.toLocaleString("en-US");

function payload(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    brand: { name: "바인허브", category: "건강기능식품", grade: "골드" },
    free_left: 0,
    public: [
      {
        id: "s-open",
        code: "s6",
        name: "하늘",
        handle: "@haneul",
        platform: "instagram",
        category: "다이어트·체형",
        followers: 62000,
        grade: "실버",
        price_cel: 2,
        free_reason: null,
        unlocked: false,
        category_fit: true,
        // 잠긴 카드인데 지표가 섞여 들어온 경우 — 파서가 버려야 한다
        stats: { m3_sales: 9800000, likes_avg: 2400 },
      },
      {
        id: "s-paid",
        name: "혜린",
        handle: "@hyerin",
        platform: "youtube",
        grade: "골드",
        price_cel: 2,
        free_reason: "WORKED",
        unlocked: true,
        category_fit: false,
        stats: {
          m3_sales: 22840000,
          likes_avg: 4200,
          engagement: 3.3,
          per_follower: 181,
          recent_likes: [100, 200, 150],
          campaigns_done: 2,
          avg_net: 5000000,
          external: [
            { source: "instagram", name: "콜라겐", brand: "타사", seen_on: "2026-10-01", price: 30000, est_orders: 378, est_low: 8500000, est_high: 14000000 },
          ],
        },
      },
    ],
    scout: [
      {
        id: "s-hidden",
        grade: "다이아",
        category: "이너뷰티·피부",
        m3_sales: 87000000,
        price_cel: 4,
        free_reason: null,
        unlocked: false,
        // 열람 전인데 신원이 섞여 들어온 경우 — 파서가 버려야 한다
        name: "로라",
        handle: "@lola",
        platform: "instagram",
        stats: { followers: 210000 },
      },
      {
        id: "s-open-hidden",
        grade: "다이아",
        m3_sales: 52000000,
        price_cel: 4,
        free_reason: "VIEWED",
        unlocked: true,
        name: "서아",
        handle: "@seoa",
        platform: "instagram",
        stats: { followers: 118000, likes_avg: 5400, engagement: 4.6, per_follower: 441 },
      },
    ],
    recommended: ["s-paid"],
    ...over,
  };
}

describe("parseGallery", () => {
  it("브랜드·무료 잔여·목록을 좁힌다", () => {
    const g = parseGallery(payload())!;
    expect(g.brand.name).toBe("바인허브");
    expect(g.freeLeft).toBe(0);
    expect(g.rows).toHaveLength(2);
    expect(g.scout).toHaveLength(2);
    expect(g.recommendedIds).toEqual(["s-paid"]);
  });

  it("**잠긴 공개 카드의 지표를 버린다** — DB 가 담아 보내도 파서가 막는다", () => {
    const row = parseGallery(payload())!.rows.find((r) => r.id === "s-open")!;
    expect(row.unlocked).toBe(false);
    expect(row.stats).toBeNull();
    // 이름·팔로워는 공개 인플루언서라 그대로 보인다
    expect(row.name).toBe("하늘");
    expect(row.followers).toBe(62000);
  });

  it("열린 카드는 지표를 유지한다 — 외부 판매 추정 포함", () => {
    const row = parseGallery(payload())!.rows.find((r) => r.id === "s-paid")!;
    expect(row.stats?.m3Sales).toBe(22840000);
    expect(row.stats?.engagement).toBe(3.3);
    expect(row.stats?.recentLikes).toEqual([100, 200, 150]);
    expect(row.stats?.external[0].estLow).toBe(8500000);
  });

  it("**열람 전 익명 카드의 신원을 버린다** — 이름이 들어와도 null", () => {
    const s = parseGallery(payload())!.scout.find((x) => x.id === "s-hidden")!;
    expect(s.name).toBeNull();
    expect(s.handle).toBeNull();
    expect(s.platform).toBeNull();
    expect(s.stats).toBeNull();
    // 등급·카테고리·매출은 익명 카드도 공개한다 (가치 판단의 근거)
    expect(s.grade).toBe("다이아");
    expect(s.m3Sales).toBe(87000000);
  });

  it("열람한 익명 카드는 신원이 공개된다", () => {
    const s = parseGallery(payload())!.scout.find((x) => x.id === "s-open-hidden")!;
    expect(s.name).toBe("서아");
    expect(s.stats?.followers).toBe(118000);
  });

  it("id 가 없는 행은 버린다", () => {
    const g = parseGallery(payload({ public: [{ name: "이름만" }, { id: "ok" }] }))!;
    expect(g.rows.map((r) => r.id)).toEqual(["ok"]);
  });

  it("ok 가 아니면 null", () => {
    expect(parseGallery({ ok: false, code: "NOT_FOUND" })).toBeNull();
    expect(parseGallery(null)).toBeNull();
  });

  it("목록이 없으면 빈 배열", () => {
    const g = parseGallery({ ok: true })!;
    expect(g.rows).toEqual([]);
    expect(g.scout).toEqual([]);
    expect(g.recommendedIds).toEqual([]);
  });
});

describe("scoutLabel — 익명 표시", () => {
  const row = (unlocked: boolean, name: string | null) => ({
    id: "x", grade: null, category: null, m3Sales: 0, priceCel: 0,
    freeReason: null, unlocked, name, handle: null, platform: null, avatarUrl: null, stats: null,
  });

  it("열람 전은 ○○○ 인플루언서", () => {
    expect(scoutLabel(row(false, null))).toBe("○○○ 인플루언서");
  });

  it("이름이 섞여 들어와도 열람 전이면 ○○○", () => {
    expect(scoutLabel(row(false, "로라"))).toBe("○○○ 인플루언서");
  });

  it("열람 후는 이름", () => {
    expect(scoutLabel(row(true, "로라"))).toBe("로라");
  });
});

describe("gradeAtLeast — '○○ 이상' 필터", () => {
  it("전체는 모두 통과", () => {
    expect(gradeAtLeast("스타터", "전체")).toBe(true);
    expect(gradeAtLeast(null, "전체")).toBe(true);
  });

  it("같은 등급도 통과(이상)", () => {
    expect(gradeAtLeast("골드", "골드")).toBe(true);
  });

  it("상위 등급은 통과 · 하위는 탈락", () => {
    expect(gradeAtLeast("다이아", "골드")).toBe(true);
    expect(gradeAtLeast("실버", "골드")).toBe(false);
  });

  it("등급이 없으면 탈락 (전체 제외)", () => {
    expect(gradeAtLeast(null, "골드")).toBe(false);
    expect(gradeAtLeast("없는등급", "골드")).toBe(false);
  });
});

describe("asFreeReason · freeReasonBadge", () => {
  it("아는 사유만 통과", () => {
    expect(asFreeReason("WORKED")).toBe("WORKED");
    expect(asFreeReason("WAT")).toBeNull();
  });

  it("함께 판매·등급 혜택만 배지를 단다 — 이미 열람(VIEWED)은 배지 없음", () => {
    expect(freeReasonBadge("WORKED")).toContain("무료");
    expect(freeReasonBadge("QUOTA")).toContain("무료");
    expect(freeReasonBadge("VIEWED")).toBeNull();
    expect(freeReasonBadge(null)).toBeNull();
  });
});

describe("parseUnlockResult · unlockMessage", () => {
  it("유상 열람", () => {
    const r = parseUnlockResult({ ok: true, already: false, charged: 2, reason: "PAID", balance: 19 });
    expect(r).toMatchObject({ ok: true, charged: 2, reason: "PAID" });
    expect(unlockMessage(r, "data", "하늘")).toContain("🥬 2 사용");
    expect(unlockMessage(r, "data", "하늘")).toContain("하늘");
  });

  it("익명 레퍼런스는 이름을 쓰지 않는다", () => {
    const r = parseUnlockResult({ ok: true, already: false, charged: 4, reason: "PAID" });
    const msg = unlockMessage(r, "ref", "로라");
    expect(msg).toContain("레퍼런스");
    expect(msg).not.toContain("로라");
  });

  it("함께 판매·등급 한도는 무료 문구", () => {
    expect(unlockMessage(parseUnlockResult({ ok: true, charged: 0, reason: "WORKED" }), "data")).toContain("함께 판매");
    const q = parseUnlockResult({ ok: true, charged: 0, reason: "QUOTA", free_left: 4 });
    expect(unlockMessage(q, "data")).toContain("4회 남음");
  });

  it("멱등", () => {
    const r = parseUnlockResult({ ok: true, already: true, charged: 0, reason: "VIEWED" });
    expect(unlockMessage(r, "data")).toContain("이미 열람");
  });

  it("잔액 부족 · 종류 불일치", () => {
    const i = parseUnlockResult({ ok: false, code: "CEL_INSUFFICIENT", price_cel: 4 });
    expect(i).toMatchObject({ ok: false, code: "CEL_INSUFFICIENT", priceCel: 4 });
    expect(unlockMessage(i, "ref")).toContain("부족");
    expect(unlockMessage(parseUnlockResult({ ok: false, code: "KIND_MISMATCH" }), "data")).toContain("열람 종류");
  });

  it("모르는 코드는 기본 문구", () => {
    expect(unlockMessage(parseUnlockResult({ ok: false, code: "WAT" }), "data")).toContain("다시 시도");
  });
});

describe("recommendReason", () => {
  const base: GalleryRow = {
    id: "x", code: null, name: null, handle: null, platform: null, avatarUrl: null, intro: null,
    category: null, followers: null, grade: null, priceCel: 0, freeReason: null, unlocked: true,
    categoryFit: true, stats: null,
  };

  it("카테고리 적합 + 매출/팔로워", () => {
    const r = recommendReason({ ...base, stats: { m3Sales: 0, likesAvg: null, engagement: null, perFollower: 181, recentLikes: [], campaignsDone: 0, avgNet: null, external: [] } }, "건강기능식품", fmt);
    expect(r).toContain("건강기능식품와 카테고리 적합");
    expect(r).toContain("181");
  });

  it("적합하지 않으면 매출 효율 상위", () => {
    expect(recommendReason({ ...base, categoryFit: false }, "건강기능식품", fmt)).toContain("매출 효율 상위");
  });

  it("잠긴 카드는 지표를 문구에 쓰지 않는다", () => {
    const r = recommendReason({ ...base, unlocked: false, stats: null }, "건강기능식품", fmt);
    expect(r).not.toContain("매출/팔로워");
  });
});
