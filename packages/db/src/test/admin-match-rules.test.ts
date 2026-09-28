import { describe, expect, it } from "vitest";
import {
  AUTO_PROPOSE_BATCH,
  autoProposeSummary,
  categoryFit,
  growthOf,
  inviteFailMessage,
  matchScore,
  pickCandidates,
  risingSellers,
  type MatchProduct,
  type MatchSeller,
} from "../admin/match-rules";

describe("growthOf — 데모 growthOf 와 같은 식 (후반 평균 / 전반 평균 − 1)", () => {
  it("시드 지유 recent_likes", () => {
    // [2900,3400,2800,3600,3100,3500] → 전반 3033.3 · 후반 3400 → +12.1%
    expect(growthOf([2900, 3400, 2800, 3600, 3100, 3500])).toBeCloseTo(12.09, 1);
  });

  it("홀수 표본 — ceil 이라 전반이 한 개 더 많다 (데모와 같다)", () => {
    // half = ceil(3/2) = 2 → 전반 [100,200] 평균 150 · 후반 [300] 평균 300 → +100%
    expect(growthOf([100, 200, 300])).toBeCloseTo(100, 5);
  });

  it("표본 2개 미만이면 0", () => {
    expect(growthOf([])).toBe(0);
    expect(growthOf([500])).toBe(0);
    expect(growthOf(null)).toBe(0);
    expect(growthOf(undefined)).toBe(0);
  });

  it("전반 평균이 0 이면 0 — 0 으로 나누지 않는다", () => {
    expect(growthOf([0, 0, 100, 200])).toBe(0);
  });

  it("감소도 음수로 나온다", () => {
    expect(growthOf([200, 200, 100, 100])).toBe(-50);
  });

  it("숫자가 아닌 값은 버린다", () => {
    expect(growthOf([100, NaN, 200, Infinity] as number[])).toBeCloseTo(100, 5);
  });
});

describe("matchScore — 데모 autoMatches 의 식", () => {
  it("growth × 0.6 + (m3/팔로워)/10 + 5", () => {
    // 15.7 × 0.6 = 9.42 · 9,800,000/62,000/10 = 15.8 · +5 → 30.2 → 30
    expect(matchScore({ growth: 15.7, m3Sales: 9800000, followers: 62000 })).toBe(30);
  });

  it("비공개는 +5 가 없다 (데모 규칙 — 실서비스는 후보에서 빠지므로 쓰이지 않는다)", () => {
    const base = { growth: 10, m3Sales: 1000000, followers: 10000 };
    expect(matchScore({ ...base, hidden: true })).toBe(matchScore(base) - 5);
  });

  it("팔로워 0 이면 두 번째 항은 0 — 0 으로 나누지 않는다", () => {
    expect(matchScore({ growth: 10, m3Sales: 5000000, followers: 0 })).toBe(11); // 6 + 0 + 5
  });

  it("성장세가 음수면 점수가 내려간다", () => {
    expect(matchScore({ growth: -50, m3Sales: 0, followers: 1000 })).toBe(-25);
  });
});

describe("categoryFit — 같은 그룹이면 적합", () => {
  const groups = {
    "다이어트·체형": "건강기능식품",
    "웰니스 푸드": "건강기능식품",
    "비타민·영양": "건강기능식품",
    "이너뷰티·피부": "이너뷰티",
  };

  it("같은 그룹", () => {
    expect(categoryFit("다이어트·체형", "웰니스 푸드", groups)).toBe(true);
    expect(categoryFit("비타민·영양", "다이어트·체형", groups)).toBe(true);
  });

  it("다른 그룹", () => {
    expect(categoryFit("다이어트·체형", "이너뷰티·피부", groups)).toBe(false);
  });

  it("모르는 카테고리 · null 은 false", () => {
    expect(categoryFit("없는카테고리", "웰니스 푸드", groups)).toBe(false);
    expect(categoryFit("웰니스 푸드", "없는카테고리", groups)).toBe(false);
    expect(categoryFit(null, "웰니스 푸드", groups)).toBe(false);
    expect(categoryFit("웰니스 푸드", null, groups)).toBe(false);
  });
});

/* ---------------- pickCandidates ---------------- */

const groups = {
  "다이어트·체형": "건강기능식품",
  "웰니스 푸드": "건강기능식품",
  "이너뷰티·피부": "이너뷰티",
};

const prod = (id: string, category: string, name = id): MatchProduct => ({
  id,
  code: id,
  name,
  category,
  brandId: "b1",
  brandCode: "b1",
  brandName: "바인허브",
});

const sell = (id: string, category: string, growth: number, m3 = 10000000, followers = 50000): MatchSeller => ({
  id,
  code: id,
  name: id,
  handle: `@${id}`,
  platform: "instagram",
  category,
  grade: "골드",
  m3Sales: m3,
  followers,
  growth,
});

describe("pickCandidates — 데모 autoMatches", () => {
  const base = { groups, activePairs: new Set<string>(), exclusiveOf: {} as Record<string, string | null> };

  it("카테고리 그룹이 맞는 사람만 · 상품별 상위 2명", () => {
    const out = pickCandidates({
      ...base,
      products: [prod("p1", "다이어트·체형")],
      sellers: [sell("s1", "다이어트·체형", 30), sell("s2", "웰니스 푸드", 20), sell("s3", "다이어트·체형", 10), sell("s4", "이너뷰티·피부", 99)],
    });
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.seller.id)).toEqual(["s1", "s2"]);
  });

  it("진행 중인 쌍은 제외", () => {
    const out = pickCandidates({
      ...base,
      activePairs: new Set(["p1:s1"]),
      products: [prod("p1", "다이어트·체형")],
      sellers: [sell("s1", "다이어트·체형", 99), sell("s2", "다이어트·체형", 10)],
    });
    expect(out.map((c) => c.seller.id)).toEqual(["s2"]);
  });

  it("독점 확정 상품은 그 인플루언서만", () => {
    const out = pickCandidates({
      ...base,
      exclusiveOf: { p1: "s2" },
      products: [prod("p1", "다이어트·체형")],
      sellers: [sell("s1", "다이어트·체형", 99), sell("s2", "다이어트·체형", 10)],
    });
    expect(out.map((c) => c.seller.id)).toEqual(["s2"]);
  });

  it("여러 상품 — 전체를 점수순으로 다시 정렬", () => {
    const out = pickCandidates({
      ...base,
      products: [prod("p1", "다이어트·체형"), prod("p2", "웰니스 푸드")],
      sellers: [sell("low", "다이어트·체형", 1), sell("high", "웰니스 푸드", 50)],
    });
    // 두 상품 모두 같은 그룹이라 각 상품에 2명씩 = 4건, 점수 내림차순
    expect(out).toHaveLength(4);
    expect(out[0].seller.id).toBe("high");
    expect(out.at(-1)!.seller.id).toBe("low");
  });

  it("후보가 없으면 빈 목록", () => {
    expect(pickCandidates({ ...base, products: [prod("p1", "이너뷰티·피부")], sellers: [sell("s1", "다이어트·체형", 10)] })).toEqual([]);
    expect(pickCandidates({ ...base, products: [], sellers: [sell("s1", "다이어트·체형", 10)] })).toEqual([]);
  });

  it("perProduct 를 바꿀 수 있다", () => {
    const out = pickCandidates({
      ...base,
      perProduct: 1,
      products: [prod("p1", "다이어트·체형")],
      sellers: [sell("s1", "다이어트·체형", 30), sell("s2", "다이어트·체형", 20)],
    });
    expect(out).toHaveLength(1);
  });

  it("동점이면 이름순 — 결과가 흔들리지 않는다", () => {
    const out = pickCandidates({
      ...base,
      products: [prod("p1", "다이어트·체형")],
      sellers: [sell("b", "다이어트·체형", 10), sell("a", "다이어트·체형", 10)],
    });
    expect(out.map((c) => c.seller.id)).toEqual(["a", "b"]);
  });
});

describe("risingSellers", () => {
  it("성장세 내림차순 상위 N", () => {
    const out = risingSellers([sell("a", "x", 5), sell("b", "x", 20), sell("c", "x", 12)], 2);
    expect(out.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("동점이면 이름순", () => {
    expect(risingSellers([sell("z", "x", 10), sell("a", "x", 10)]).map((s) => s.id)).toEqual(["a", "z"]);
  });
});

describe("실행 결과 문구", () => {
  const row = (ok: boolean) => ({ productCode: "p1", productName: "버닝온", sellerName: "지유", sellerHandle: "@j", ok, reason: ok ? null : "x", campaignCode: null });

  it("전부 성공", () => {
    expect(autoProposeSummary([row(true), row(true)])).toBe("2건 발송");
  });

  it("일부 실패", () => {
    expect(autoProposeSummary([row(true), row(false)])).toBe("1건 발송 · 1건 실패");
  });

  it("후보 없음", () => {
    expect(autoProposeSummary([])).toBe("보낼 후보가 없습니다");
  });

  it("0016 실패 코드를 사람 말로 — 6단계 게이트를 설명한다", () => {
    expect(inviteFailMessage("PRIORITY_INVITE_GATED")).toContain("🥬 제안권");
    expect(inviteFailMessage("SELLER_HIDDEN")).toContain("비공개");
    expect(inviteFailMessage("ALREADY_ACTIVE")).toContain("이미 진행 중");
    expect(inviteFailMessage("모르는코드")).toBe(INVITE_FALLBACK);
  });

  it("한 번에 보내는 기본 건수는 5 (데모와 같다)", () => {
    expect(AUTO_PROPOSE_BATCH).toBe(5);
  });
});

const INVITE_FALLBACK = "처리에 실패했습니다";
