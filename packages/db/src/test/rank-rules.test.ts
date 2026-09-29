/**
 * 랭킹 · 추천 규칙(`partner/rank-rules.ts`) 테스트 — 파서 · 익명 계약 · 문구.
 * 순위·지표 계산은 DB(0026)가 하므로 여기서는 검증하지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  anonLabel,
  boostLine,
  nextGradeLine,
  parseRanking,
  parseReferral,
  referralTerms,
  type RankingRow,
} from "../partner/rank-rules";

const fmt = (n: number) => n.toLocaleString("en-US");

function rankingPayload(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    me: {
      grade: "골드",
      top_pct: 18,
      perk: "수수료 +1%p",
      bonus_pp: 1,
      m3_sales: 15600000,
      rank: 5,
      total: 8,
      next_grade: "플래티넘",
      next_min: 30000000,
      next_perk: "수수료 +1.5%p",
      next_gap: 14400000,
      next_pct: 52,
    },
    tiers: [{ name: "블랙", min_m3_sales: 100000000, top_pct: 1, bonus_pp: 3, perk: "…", is_mine: false }],
    rows: [
      { rank: 1, is_me: false, name: "로라", handle: "@lola", m3_sales: 87000000, followers: 210000, likes_avg: 12800, per_follower: 414, per_like: 6797, grade: "다이아", category: "이너뷰티·피부" },
      { rank: 5, is_me: true, name: "지유", handle: "@jiyu", m3_sales: 15600000, followers: 84300, likes_avg: 3100, per_follower: 185, per_like: 5032, grade: "골드", category: "이너뷰티·피부" },
    ],
    ...over,
  };
}

describe("parseRanking", () => {
  it("내 등급 카드를 좁힌다", () => {
    const r = parseRanking(rankingPayload())!;
    expect(r.me.grade).toBe("골드");
    expect(r.me.topPct).toBe(18);
    expect(r.me.rank).toBe(5);
    expect(r.me.nextGap).toBe(14400000);
    expect(r.me.nextPct).toBe(52);
  });

  it("**남의 이름은 버린다** — DB 가 담아 보내도 파서가 막는다(익명 계약)", () => {
    const r = parseRanking(rankingPayload())!;
    const other = r.rows.find((x) => !x.isMe)!;
    expect(other.name).toBeNull();
    expect(other.handle).toBeNull();
    // 지표와 순위는 그대로 공개된다
    expect(other.m3Sales).toBe(87000000);
    expect(other.perFollower).toBe(414);
  });

  it("내 행은 이름을 유지한다", () => {
    const me = parseRanking(rankingPayload())!.rows.find((x) => x.isMe)!;
    expect(me.name).toBe("지유");
    expect(me.handle).toBe("@jiyu");
  });

  it("ok 가 아니면 null — 화면은 안내를 띄운다", () => {
    expect(parseRanking({ ok: false, code: "NOT_FOUND" })).toBeNull();
    expect(parseRanking(null)).toBeNull();
  });

  it("효율 지표가 null 이면 null 로 남는다 — 0 나눗셈을 화면에 흘리지 않는다", () => {
    const r = parseRanking(rankingPayload({ rows: [{ rank: 1, is_me: false, m3_sales: 100, per_follower: null, per_like: null }] }))!;
    expect(r.rows[0].perFollower).toBeNull();
    expect(r.rows[0].perLike).toBeNull();
  });

  it("rank 가 없는 행은 버린다", () => {
    const r = parseRanking(rankingPayload({ rows: [{ is_me: false, m3_sales: 1 }, { rank: 2, is_me: false }] }))!;
    expect(r.rows.map((x) => x.rank)).toEqual([2]);
  });

  it("최고 등급이면 nextPct 100 · nextGap null", () => {
    const r = parseRanking(rankingPayload({ me: { grade: "블랙", next_grade: null, next_gap: null, next_pct: 100, m3_sales: 1 } }))!;
    expect(r.me.nextGrade).toBeNull();
    expect(r.me.nextPct).toBe(100);
  });
});

describe("anonLabel — 익명 표시", () => {
  const row = (isMe: boolean, name: string | null): RankingRow => ({
    rank: 1, isMe, name, handle: null, category: null, m3Sales: 0,
    followers: null, likesAvg: null, perFollower: null, perLike: null, grade: null,
  });

  it("남은 언제나 ○○○ 인플루언서", () => {
    expect(anonLabel(row(false, null))).toBe("○○○ 인플루언서");
  });

  it("이름이 섞여 들어와도 ○○○ 으로 덮는다", () => {
    expect(anonLabel(row(false, "로라"))).toBe("○○○ 인플루언서");
  });

  it("내 행은 이름", () => {
    expect(anonLabel(row(true, "지유"))).toBe("지유");
  });
});

describe("nextGradeLine", () => {
  it("다음 등급까지 남은 금액과 혜택", () => {
    const r = parseRanking(rankingPayload())!;
    const line = nextGradeLine(r.me, fmt);
    expect(line).toContain("플래티넘");
    expect(line).toContain("14,400,000");
    expect(line).toContain("수수료 +1.5%p");
  });

  it("최고 등급이면 혜택 문구", () => {
    const r = parseRanking(rankingPayload({ me: { grade: "블랙", perk: "수수료 +3%p", next_grade: null, next_gap: null, m3_sales: 1 } }))!;
    expect(nextGradeLine(r.me, fmt)).toContain("최고 등급");
    expect(nextGradeLine(r.me, fmt)).toContain("수수료 +3%p");
  });
});

describe("parseReferral", () => {
  const payload = {
    ok: true,
    ref_code: "JIYU10",
    times: 5,
    total: 186400,
    count: 1,
    rows: [{ name: "민지", handle: "@minji_diet", avatar_url: null, used: 1, times: 5, amount: 186400, joined_at: "2026-01-01" }],
    referred_by: null,
  };

  it("내 코드 · 누적 · 인원 · 추천한 사람", () => {
    const f = parseReferral(payload)!;
    expect(f.refCode).toBe("JIYU10");
    expect(f.total).toBe(186400);
    expect(f.count).toBe(1);
    expect(f.rows[0].name).toBe("민지"); // 내가 데려온 사람은 실명
    expect(f.rows[0].used).toBe(1);
    expect(f.boost).toBeNull();
  });

  it("피추천이면 부스트 정보 — 남은 횟수", () => {
    const f = parseReferral({ ...payload, referred_by: { name: "지유", handle: "@jiyu", used: 1, left: 4 } })!;
    expect(f.boost).toEqual({ name: "지유", handle: "@jiyu", used: 1, left: 4 });
  });

  it("times 가 0/누락이면 5 로 떨어진다", () => {
    expect(parseReferral({ ...payload, times: 0 })!.times).toBe(5);
    expect(parseReferral({ ok: true })!.times).toBe(5);
  });

  it("ok 가 아니면 null", () => {
    expect(parseReferral({ ok: false })).toBeNull();
  });

  it("rows 가 없으면 빈 배열 · 코드가 없으면 null", () => {
    const f = parseReferral({ ok: true })!;
    expect(f.rows).toEqual([]);
    expect(f.refCode).toBeNull();
  });
});

describe("referralTerms · boostLine — 요율은 constants 가 정답", () => {
  it("보상 구조 3줄에 2% · +1%p · 횟수가 들어간다", () => {
    const t = referralTerms(5);
    expect(t).toHaveLength(3);
    expect(t[0]).toContain("첫 5회");
    expect(t[0]).toContain("2%");
    expect(t[1]).toContain("+1%p");
    expect(t[2]).toContain("깎이지 않음");
  });

  it("부스트 배너에 추천인 이름과 남은 횟수", () => {
    const line = boostLine({ name: "지유", handle: "@jiyu", used: 1, left: 4 }, 5);
    expect(line).toContain("지유");
    expect(line).toContain("남은 횟수 4회");
    expect(line).toContain("셀러리가 부담");
  });

  it("추천인 이름이 없어도 문구가 깨지지 않는다", () => {
    expect(boostLine({ name: null, handle: null, used: 0, left: 5 }, 5)).toContain("추천인");
  });
});
